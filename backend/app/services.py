"""Business logic: availability engine, pricing, QR tokens, serializers."""

import base64
import hashlib
import hmac
import json
import math
import secrets
from datetime import date, datetime, time as dt_time, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models
from . import payments
from .config import (
    FREE_CANCEL_HOURS,
    LATE_CANCEL_REFUND_PERCENT,
    PENDING_PAYMENT_TTL_MINUTES,
    PLATFORM_FEE_PERCENT,
    QR_SECRET,
)

ACTIVE_STATUSES = ("reserved", "parked")


def minutes(value: str) -> int:
    hours, mins = value.split(":")[:2]
    return int(hours) * 60 + int(mins)


def fmt_time(total_minutes: int) -> str:
    total_minutes = max(0, min(total_minutes, 24 * 60 - 1))
    return f"{total_minutes // 60:02d}:{total_minutes % 60:02d}"


def overlaps(a_start: str, a_end: str, b_start: str, b_end: str) -> bool:
    return minutes(a_start) < minutes(b_end) and minutes(b_start) < minutes(a_end)


def booking_start_dt(booking: models.Booking) -> datetime:
    return datetime.combine(booking.booking_date, dt_time.min) + timedelta(
        minutes=minutes(booking.start_time)
    )


def booking_end_dt(booking: models.Booking) -> datetime:
    return datetime.combine(booking.booking_date, dt_time.min) + timedelta(
        minutes=minutes(booking.end_time)
    )


# --------------------------------------------------------------------------- #
# Availability
# --------------------------------------------------------------------------- #
def location_status(
    db: Session,
    location: models.ParkingLocation,
    booking_date: date,
    start_time: str,
    end_time: str,
    exclude_booking_id: int | None = None,
) -> dict:
    """Compute slot-level availability for one location and one time window.

    A location is never marked unavailable for a whole day just because of a
    reservation in a different window: only overlapping reservations count.
    """
    slots = [s for s in location.slots if s.is_active and not s.is_blocked]
    total = len(slots)
    today = date.today()

    rows = db.scalars(
        select(models.Booking).where(
            models.Booking.location_id == location.id,
            models.Booking.status.in_(ACTIVE_STATUSES),
        )
    ).all()

    parked_slots: set[int] = set()
    reserved_slots: set[int] = set()
    for booking in rows:
        if exclude_booking_id and booking.id == exclude_booking_id:
            continue
        if booking.status == "parked":
            # A physically parked car only blocks the current day.
            if booking_date == today:
                parked_slots.add(booking.slot_id)
        elif booking.booking_date == booking_date and overlaps(
            booking.start_time, booking.end_time, start_time, end_time
        ):
            reserved_slots.add(booking.slot_id)

    usable = {slot.id for slot in slots}
    parked = {sid for sid in parked_slots if sid in usable}
    reserved = {sid for sid in reserved_slots if sid in usable} - parked

    free_slots = [slot for slot in slots if slot.id not in parked and slot.id not in reserved]
    available = len(free_slots)
    occupied_count = len(parked)
    reserved_count = len(reserved)

    if total == 0:
        status = "red"
    elif available == 0:
        status = "red" if occupied_count >= total else "orange"
    elif reserved_count > 0:
        status = "orange"
    else:
        status = "green"

    return {
        "date": booking_date.isoformat(),
        "start_time": start_time,
        "end_time": end_time,
        "total_slots": total,
        "available_slots": available,
        "occupied_slots": occupied_count,
        "reserved_slots": reserved_count,
        "status": status,
        "free_slot_ids": [slot.id for slot in free_slots],
        "free_slot_labels": [slot.label for slot in free_slots],
    }


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    )
    return 2 * radius * math.asin(math.sqrt(a))


def estimate_price(location: models.ParkingLocation, start_time: str, end_time: str) -> dict:
    duration = max(15, minutes(end_time) - minutes(start_time))
    hours = duration / 60
    if duration >= 24 * 60 and location.price_monthly:
        amount = location.price_monthly / 30 * (duration / (24 * 60))
        basis = "monthly"
    elif duration >= 8 * 60 and location.price_daily:
        days = math.ceil(duration / (24 * 60))
        amount = location.price_daily * days
        basis = "daily"
    else:
        amount = location.price_hourly * math.ceil(hours)
        basis = "hourly"
    return {"duration_minutes": duration, "hours": round(hours, 2), "amount": round(amount, 2), "basis": basis}


# --------------------------------------------------------------------------- #
# QR tokens
# --------------------------------------------------------------------------- #
def _sign(payload: str) -> str:
    digest = hmac.new(QR_SECRET.encode(), payload.encode(), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest).decode().rstrip("=")


def make_qr_token(booking_code: str) -> str:
    payload = f"{booking_code}.{secrets.token_urlsafe(6)}"
    return f"{payload}.{_sign(payload)}"


def parse_qr_token(token: str) -> str | None:
    token = (token or "").strip()
    parts = token.split(".")
    if len(parts) != 3:
        return None
    payload = f"{parts[0]}.{parts[1]}"
    if not hmac.compare_digest(_sign(payload), parts[2]):
        return None
    return parts[0]


# --------------------------------------------------------------------------- #
# Cancellation policy / refunds
# --------------------------------------------------------------------------- #
def refund_quote(booking: models.Booking) -> tuple[float, str]:
    if booking.status == "parked":
        return 0.0, "Already checked in – cancellation is not allowed. Contact the landowner."
    start = booking_start_dt(booking)
    now = datetime.now()
    hours_left = (start - now).total_seconds() / 3600
    if hours_left >= FREE_CANCEL_HOURS:
        return round(booking.amount, 2), "Free cancellation before the start time – full refund"
    if hours_left > 0:
        amount = round(booking.amount * LATE_CANCEL_REFUND_PERCENT / 100, 2)
        return amount, f"Cancelled within {FREE_CANCEL_HOURS} hours of the start – {LATE_CANCEL_REFUND_PERCENT}% refund"
    return 0.0, "The booking start time has passed – no refund"


def split_revenue(amount: float) -> tuple[float, float]:
    fee = round(amount * PLATFORM_FEE_PERCENT / 100, 2)
    return round(amount - fee, 2), fee


def expire_stale_bookings(db: Session) -> list[int]:
    """Mark unpaid/expired reservations so their slots are released automatically."""
    now = datetime.now()
    changed_locations: list[int] = []
    rows = db.scalars(
        select(models.Booking).where(
            models.Booking.status.in_(("reserved", "pending_payment"))
        )
    ).all()
    for booking in rows:
        if booking.status == "pending_payment":
            created = booking.created_at or now
            if (now - created) > timedelta(minutes=PENDING_PAYMENT_TTL_MINUTES):
                booking.status = "cancelled"
                booking.cancelled_at = now
                if booking.payment and booking.payment.status == "created":
                    booking.payment.status = "cancelled"
                changed_locations.append(booking.location_id)
            continue
        if booking_end_dt(booking) < now:
            booking.status = "expired"
            changed_locations.append(booking.location_id)
    if changed_locations:
        db.commit()
    return changed_locations


# --------------------------------------------------------------------------- #
# Serializers
# --------------------------------------------------------------------------- #
def rating_for(location: models.ParkingLocation) -> dict:
    ratings = [review.rating for review in location.reviews]
    if not ratings:
        return {"average": 0.0, "count": 0}
    return {"average": round(sum(ratings) / len(ratings), 1), "count": len(ratings)}


def serialize_location(
    location: models.ParkingLocation,
    availability: dict | None = None,
    distance_km: float | None = None,
    include_owner: bool = True,
) -> dict:
    data = {
        "id": location.id,
        "name": location.name,
        "description": location.description,
        "address": location.address,
        "city": location.city,
        "area": location.area,
        "latitude": location.latitude,
        "longitude": location.longitude,
        "total_slots": location.total_slots,
        "price_hourly": location.price_hourly,
        "price_daily": location.price_daily,
        "price_monthly": location.price_monthly,
        "open_time": location.open_time,
        "close_time": location.close_time,
        "images": location.images,
        "status": location.status,
        "rejection_reason": location.rejection_reason,
        "created_at": location.created_at.isoformat() if location.created_at else None,
        "rating": rating_for(location),
        "availability": availability,
        "distance_km": round(distance_km, 2) if distance_km is not None else None,
    }
    if include_owner and location.owner:
        data["owner"] = {
            "id": location.owner.id,
            "full_name": location.owner.full_name,
            "phone": location.owner.phone,
            "email": location.owner.email,
            "member_since": location.owner.created_at.strftime("%b %Y") if location.owner.created_at else None,
        }
    return data


def serialize_booking(booking: models.Booking, include_customer: bool = True) -> dict:
    payment = booking.payment
    data = {
        "id": booking.id,
        "code": booking.code,
        "booking_date": booking.booking_date.isoformat(),
        "start_time": booking.start_time,
        "end_time": booking.end_time,
        "amount": booking.amount,
        "status": booking.status,
        "qr_token": booking.qr_token,
        "vehicle_number": booking.vehicle_number,
        "created_at": booking.created_at.isoformat() if booking.created_at else None,
        "checked_in_at": booking.checked_in_at.isoformat() if booking.checked_in_at else None,
        "checked_out_at": booking.checked_out_at.isoformat() if booking.checked_out_at else None,
        "cancelled_at": booking.cancelled_at.isoformat() if booking.cancelled_at else None,
        "refund_amount": booking.refund_amount,
        "refund_status": booking.refund_status,
        "slot": {"id": booking.slot.id, "label": booking.slot.label} if booking.slot else None,
        "location": {
            "id": booking.location.id,
            "name": booking.location.name,
            "address": booking.location.address,
            "city": booking.location.city,
            "area": booking.location.area,
            "latitude": booking.location.latitude,
            "longitude": booking.location.longitude,
            "open_time": booking.location.open_time,
            "close_time": booking.location.close_time,
            "images": booking.location.images,
        }
        if booking.location
        else None,
        "payment": {
            "status": payment.status,
            "mode": payment.mode,
            "method": payment.method,
            "amount": payment.amount,
            "currency": payment.currency,
            "provider_order_id": payment.provider_order_id,
            "provider_payment_id": payment.provider_payment_id,
            "receipt_no": payment.receipt_no,
            "paid_at": payment.paid_at.isoformat() if payment.paid_at else None,
            "key_id": payments.public_key(),
        }
        if payment
        else None,
    }
    if include_customer and booking.customer:
        data["customer"] = {
            "id": booking.customer.id,
            "full_name": booking.customer.full_name,
            "email": booking.customer.email,
            "phone": booking.customer.phone,
        }
    return data


def dumps(data: dict) -> dict:
    """Round-trip through JSON so SQLite/Decimal values are plain JSON types."""
    return json.loads(json.dumps(data, default=str))
