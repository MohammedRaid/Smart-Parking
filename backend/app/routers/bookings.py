import random
import string
import threading
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models, payments, schemas
from ..database import get_db
from ..notify import notify
from ..realtime import broadcast_sync
from ..security import get_current_user, require_admin, require_customer, require_landowner
from ..services import (
    ACTIVE_STATUSES,
    booking_end_dt,
    booking_start_dt,
    dumps,
    estimate_price,
    expire_stale_bookings,
    location_status,
    make_qr_token,
    minutes,
    parse_qr_token,
    refund_quote,
    serialize_booking,
    split_revenue,
)
from ..config import CURRENCY

router = APIRouter(tags=["bookings"])

# Guards the read-check-write of slot assignment so two customers can never be
# given the same free slot for the same window inside this process.
BOOKING_LOCK = threading.Lock()


def _new_code() -> str:
    return "SP" + datetime.now().strftime("%y%m%d") + "".join(random.choices(string.digits, k=4))


def _get_booking(db: Session, code: str) -> models.Booking:
    booking = db.scalar(select(models.Booking).where(models.Booking.code == code.upper().strip()))
    if booking is None:
        raise HTTPException(status_code=404, detail="Booking not found")
    return booking


def _guard_booking(booking: models.Booking, user: models.User) -> None:
    if user.role == "admin":
        return
    if user.role == "customer" and booking.user_id == user.id:
        return
    if user.role == "landowner" and booking.location.owner_id == user.id:
        return
    raise HTTPException(status_code=403, detail="You do not have access to this booking")


def _validate_window(booking_date: date, start_time: str, end_time: str) -> None:
    if booking_date < date.today():
        raise HTTPException(status_code=400, detail="You cannot book a date in the past")
    if booking_date > date.today() + timedelta(days=90):
        raise HTTPException(status_code=400, detail="Bookings are open for the next 90 days only")
    if minutes(start_time) >= minutes(end_time):
        raise HTTPException(status_code=400, detail="Departure time must be after the arrival time")
    if minutes(end_time) - minutes(start_time) < 30:
        raise HTTPException(status_code=400, detail="A booking must be at least 30 minutes long")
    if booking_date == date.today():
        now_minutes = datetime.now().hour * 60 + datetime.now().minute
        if minutes(end_time) <= now_minutes:
            raise HTTPException(status_code=400, detail="That time window has already passed today")


@router.post("/api/bookings", status_code=201)
def create_booking(
    payload: schemas.BookingCreateIn,
    user: models.User = Depends(require_customer),
    db: Session = Depends(get_db),
):
    expire_stale_bookings(db)
    location = db.get(models.ParkingLocation, payload.location_id)
    if location is None or location.status != "approved":
        raise HTTPException(status_code=404, detail="Parking location not found")
    _validate_window(payload.booking_date, payload.start_time, payload.end_time)
    if payload.start_time < location.open_time or payload.end_time > location.close_time:
        raise HTTPException(
            status_code=400,
            detail=f"This location is open from {location.open_time} to {location.close_time}",
        )

    price = estimate_price(location, payload.start_time, payload.end_time)
    if price["amount"] <= 0:
        raise HTTPException(status_code=400, detail="Could not calculate a price for this window")

    with BOOKING_LOCK:
        availability = location_status(
            db, location, payload.booking_date, payload.start_time, payload.end_time
        )
        if not availability["free_slot_ids"]:
            raise HTTPException(
                status_code=409,
                detail="No parking slots are available at this location for the selected date and time",
            )
        slot = db.get(models.ParkingSlot, availability["free_slot_ids"][0])

        code = _new_code()
        while db.scalar(select(models.Booking.id).where(models.Booking.code == code)):
            code = _new_code()
        receipt_no = "RCPT-" + code

        order = payments.create_order(
            price["amount"],
            receipt=receipt_no,
            notes={"booking": code, "location": location.name[:60]},
        )

        booking = models.Booking(
            code=code,
            user_id=user.id,
            location_id=location.id,
            slot_id=slot.id,
            booking_date=payload.booking_date,
            start_time=payload.start_time,
            end_time=payload.end_time,
            amount=price["amount"],
            status="pending_payment",
            qr_token=make_qr_token(code),
            vehicle_number=(payload.vehicle_number or "").strip() or None,
        )
        db.add(booking)
        db.flush()

        payment = models.Payment(
            booking_id=booking.id,
            user_id=user.id,
            amount=price["amount"],
            currency=CURRENCY,
            provider="razorpay",
            mode=payments.mode(),
            provider_order_id=order["id"],
            status="created",
            receipt_no=receipt_no,
        )
        db.add(payment)
        notify(
            db,
            user.id,
            "Booking started",
            f"Slot {slot.label} at {location.name} is held for 15 minutes until payment is completed.",
            "info",
        )
        db.commit()
        db.refresh(booking)

    broadcast_sync("booking_created", {"location_id": location.id, "booking_code": booking.code})

    return {
        "booking": dumps(serialize_booking(booking)),
        "pricing": price,
        "checkout": {
            "mode": payments.mode(),
            "order_id": order["id"],
            "key_id": payments.public_key(),
            "amount": order["amount"],
            "currency": order["currency"],
            "receipt": receipt_no,
            "mock_payment_allowed": not payments.PAYMENTS_LIVE,
        },
    }


@router.get("/api/bookings")
def my_bookings(
    scope: str = Query("all", pattern="^(all|upcoming|past|active)$"),
    user: models.User = Depends(require_customer),
    db: Session = Depends(get_db),
):
    expire_stale_bookings(db)
    rows = db.scalars(
        select(models.Booking)
        .where(models.Booking.user_id == user.id)
        .order_by(models.Booking.booking_date.desc(), models.Booking.start_time.desc())
    ).all()
    now = datetime.now()
    result = []
    for booking in rows:
        if scope == "active" and booking.status not in ACTIVE_STATUSES:
            continue
        if scope == "upcoming" and not (
            booking.status in ("reserved", "parked") and booking_end_dt(booking) >= now
        ):
            continue
        if scope == "past" and booking.status not in ("completed", "cancelled", "expired"):
            continue
        result.append(dumps(serialize_booking(booking)))
    return result


@router.get("/api/bookings/{code}")
def booking_detail(code: str, user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    booking = _get_booking(db, code)
    _guard_booking(booking, user)
    data = dumps(serialize_booking(booking))
    refund_amount, policy = refund_quote(booking)
    data["cancellation"] = {
        "refund_amount": refund_amount,
        "policy": policy,
        "can_cancel": booking.status in ("reserved", "pending_payment"),
    }
    data["verifications"] = [
        {
            "action": row.action,
            "result": row.result,
            "note": row.note,
            "scanned_at": row.scanned_at.isoformat(),
        }
        for row in db.scalars(
            select(models.QrVerification)
            .where(models.QrVerification.booking_id == booking.id)
            .order_by(models.QrVerification.scanned_at.desc())
        ).all()
    ]
    return data


@router.post("/api/bookings/{code}/cancel")
def cancel_booking(
    code: str,
    payload: schemas.CancelIn | None = None,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    booking = _get_booking(db, code)
    if booking.user_id != user.id and user.role != "admin":
        raise HTTPException(status_code=403, detail="You can only cancel your own bookings")
    if booking.status in ("cancelled", "expired", "completed"):
        raise HTTPException(status_code=400, detail=f"This booking is already {booking.status}")
    if booking.status == "parked":
        raise HTTPException(
            status_code=400,
            detail="The vehicle is already parked. Ask the landowner to check it out before cancelling.",
        )

    refund_amount, policy = refund_quote(booking)
    payment = booking.payment
    if payment and payment.status == "paid" and refund_amount > 0:
        refund = payments.create_refund(
            payment.provider_payment_id or payment.provider_order_id,
            refund_amount,
            notes={"booking": booking.code},
        )
        booking.refund_amount = refund_amount
        booking.refund_status = "processed"
        payment.status = "refunded"
        db.add(
            models.Transaction(
                payment_id=payment.id,
                booking_id=booking.id,
                user_id=booking.user_id,
                kind="refund",
                amount=-refund_amount,
                status="succeeded",
                reference=refund.get("id", ""),
                note=policy,
            )
        )
    elif payment and payment.status == "paid":
        booking.refund_amount = 0
        booking.refund_status = "not_applicable"
        db.add(
            models.Transaction(
                payment_id=payment.id,
                booking_id=booking.id,
                user_id=booking.user_id,
                kind="refund",
                amount=0,
                status="succeeded",
                reference="",
                note=policy,
            )
        )

    booking.status = "cancelled"
    booking.cancelled_at = datetime.now()
    notify(
        db,
        booking.user_id,
        "Booking cancelled",
        f"{booking.code} has been cancelled. {policy}.",
        "warning",
    )
    notify(
        db,
        booking.location.owner_id,
        "Reservation released",
        f"Booking {booking.code} at {booking.location.name} was cancelled and the slot is free again.",
        "info",
    )
    db.commit()
    db.refresh(booking)
    broadcast_sync("booking_cancelled", {"location_id": booking.location_id, "booking_code": booking.code})
    return {
        "booking": dumps(serialize_booking(booking)),
        "refund_amount": booking.refund_amount,
        "policy": policy,
    }


# --------------------------------------------------------------------------- #
# QR verification (landowner scans)
# --------------------------------------------------------------------------- #
@router.post("/api/bookings/verify")
def verify_qr(
    payload: schemas.QrVerifyIn,
    user: models.User = Depends(require_landowner),
    db: Session = Depends(get_db),
):
    raw = (payload.qr_token or "").strip()
    # Accept a bare booking code too (manual entry fallback).
    code = parse_qr_token(raw) or (raw.upper() if raw.upper().startswith("SP") else None)

    def fail(message: str, booking: models.Booking | None = None) -> None:
        db.add(
            models.QrVerification(
                booking_id=booking.id if booking else None,
                scanned_by=user.id,
                action="invalid",
                result="failed",
                note=message[:200],
            )
        )
        db.commit()
        raise HTTPException(status_code=400, detail=message)

    if not code:
        fail("This QR code is not a valid SmartPark pass")

    booking = db.scalar(select(models.Booking).where(models.Booking.code == code))
    if booking is None:
        fail("This QR code does not belong to any booking")
    if booking.location.owner_id != user.id:
        fail("This booking belongs to another landowner's parking location", booking)

    action = payload.action
    if action == "auto":
        action = "check_out" if booking.status == "parked" else "check_in"

    if booking.status in ("cancelled", "expired"):
        fail(f"Booking {booking.code} is {booking.status} and cannot be used", booking)
    if booking.status == "completed":
        fail(f"Booking {booking.code} has already been checked out", booking)
    if booking.status == "pending_payment":
        fail(f"Booking {booking.code} is still awaiting payment", booking)

    now = datetime.now()
    if action == "check_in":
        if booking.status == "parked":
            fail("This vehicle is already checked in", booking)
        start = booking_start_dt(booking)
        end = booking_end_dt(booking)
        if now < start - timedelta(minutes=60):
            fail(
                f"Too early – this pass is valid from {start:%d %b %H:%M}. Early entry is allowed up to 60 minutes before.",
                booking,
            )
        if now > end:
            fail(f"Booking {booking.code} has expired (window ended {end:%d %b %H:%M})", booking)
        booking.status = "parked"
        booking.checked_in_at = now
        message = f"{booking.code} verified – vehicle parked in slot {booking.slot.label}"
        notify(db, booking.user_id, "Parking started", message, "success")
    else:
        if booking.status != "parked":
            fail("This booking has not been checked in yet", booking)
        booking.status = "completed"
        booking.checked_out_at = now
        message = f"{booking.code} checked out – slot {booking.slot.label} released"
        notify(db, booking.user_id, "Parking completed", message, "success")

    db.add(
        models.QrVerification(
            booking_id=booking.id,
            scanned_by=user.id,
            action=action,
            result="success",
            note=message[:200],
        )
    )
    db.commit()
    db.refresh(booking)
    broadcast_sync(
        "booking_verified" if action == "check_in" else "booking_completed",
        {"location_id": booking.location_id, "booking_code": booking.code},
    )
    return {
        "action": action,
        "message": message,
        "booking": dumps(serialize_booking(booking)),
    }


# --------------------------------------------------------------------------- #
# Landowner reservations + earnings
# --------------------------------------------------------------------------- #
@router.get("/api/landowner/bookings")
def landowner_bookings(
    scope: str = Query("all", pattern="^(all|upcoming|active|completed)$"),
    location_id: int | None = None,
    user: models.User = Depends(require_landowner),
    db: Session = Depends(get_db),
):
    expire_stale_bookings(db)
    stmt = (
        select(models.Booking)
        .join(models.ParkingLocation, models.Booking.location_id == models.ParkingLocation.id)
        .where(models.ParkingLocation.owner_id == user.id)
        .order_by(models.Booking.booking_date.desc(), models.Booking.start_time.desc())
    )
    if location_id:
        stmt = stmt.where(models.Booking.location_id == location_id)
    rows = db.scalars(stmt).all()
    output = []
    for booking in rows:
        if scope == "upcoming" and booking.status != "reserved":
            continue
        if scope == "active" and booking.status != "parked":
            continue
        if scope == "completed" and booking.status not in ("completed", "cancelled", "expired"):
            continue
        output.append(dumps(serialize_booking(booking)))
    return output


@router.get("/api/landowner/earnings")
def landowner_earnings(
    user: models.User = Depends(require_landowner),
    db: Session = Depends(get_db),
):
    locations = db.scalars(
        select(models.ParkingLocation).where(models.ParkingLocation.owner_id == user.id)
    ).all()
    location_ids = [loc.id for loc in locations]
    bookings = (
        db.scalars(
            select(models.Booking).where(models.Booking.location_id.in_(location_ids))
        ).all()
        if location_ids
        else []
    )
    earned_statuses = {"reserved", "parked", "completed"}
    earned = [b for b in bookings if b.status in earned_statuses]
    gross = round(sum(b.amount for b in earned), 2)
    net, fee = split_revenue(gross)
    refunded = round(sum(b.refund_amount or 0 for b in bookings), 2)

    monthly: dict[str, dict] = {}
    for months_back in range(5, -1, -1):
        point = (date.today().replace(day=1) - timedelta(days=30 * months_back))
        monthly[point.strftime("%Y-%m")] = {"month": point.strftime("%b %Y"), "earnings": 0.0, "bookings": 0}
    for booking in earned:
        key = booking.booking_date.strftime("%Y-%m")
        if key in monthly:
            monthly[key]["earnings"] = round(monthly[key]["earnings"] + booking.amount, 2)
            monthly[key]["bookings"] += 1

    per_location = []
    for location in locations:
        rows = [b for b in earned if b.location_id == location.id]
        location_gross = round(sum(b.amount for b in rows), 2)
        location_net, _ = split_revenue(location_gross)
        per_location.append(
            {
                "id": location.id,
                "name": location.name,
                "city": location.city,
                "status": location.status,
                "bookings": len(rows),
                "gross": location_gross,
                "net": location_net,
                "hourly": location.price_hourly,
            }
        )

    transactions = db.scalars(
        select(models.Transaction)
        .join(models.Payment, models.Transaction.payment_id == models.Payment.id, isouter=True)
        .where(
            (models.Transaction.user_id == user.id)
            | (models.Transaction.booking_id.in_([b.id for b in earned] or [0]))
        )
        .order_by(models.Transaction.created_at.desc())
        .limit(50)
    ).all()

    return {
        "gross_earnings": gross,
        "net_earnings": net,
        "platform_fee": fee,
        "refunds": refunded,
        "paid_bookings": len(earned),
        "active_bookings": len([b for b in bookings if b.status in ACTIVE_STATUSES]),
        "completed_bookings": len([b for b in bookings if b.status == "completed"]),
        "monthly": list(monthly.values()),
        "locations": per_location,
        "transactions": [
            {
                "id": row.id,
                "kind": row.kind,
                "amount": row.amount,
                "status": row.status,
                "reference": row.reference,
                "note": row.note,
                "created_at": row.created_at.isoformat(),
            }
            for row in transactions
        ],
    }
