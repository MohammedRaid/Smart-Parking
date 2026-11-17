from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models, payments, schemas
from ..database import get_db
from ..notify import notify
from ..realtime import broadcast_sync
from ..security import get_current_user, require_customer
from ..services import dumps, serialize_booking, split_revenue

router = APIRouter(prefix="/api/payments", tags=["payments"])


def _confirm_paid(
    db: Session,
    booking: models.Booking,
    provider_payment_id: str,
    method: str | None,
    mode: str,
) -> models.Booking:
    """Single place where a booking becomes paid + reserved (idempotent)."""
    payment = booking.payment
    if payment is None:
        raise HTTPException(status_code=400, detail="No payment record exists for this booking")
    if payment.status == "paid":
        return booking
    if booking.status in ("cancelled", "expired"):
        raise HTTPException(
            status_code=409,
            detail="This booking was released because payment was not completed in time",
        )

    payment.status = "paid"
    payment.provider_payment_id = provider_payment_id
    payment.method = method or "upi"
    payment.mode = mode
    payment.paid_at = datetime.now()
    booking.status = "reserved"

    owner_net, fee = split_revenue(booking.amount)
    db.add(
        models.Transaction(
            payment_id=payment.id,
            booking_id=booking.id,
            user_id=booking.user_id,
            kind="payment",
            amount=booking.amount,
            status="succeeded",
            reference=provider_payment_id,
            note=f"{payment.method} payment for {booking.code}",
        )
    )
    db.add(
        models.Transaction(
            payment_id=payment.id,
            booking_id=booking.id,
            user_id=booking.location.owner_id,
            kind="platform_fee",
            amount=fee,
            status="succeeded",
            reference=provider_payment_id,
            note=f"Platform fee ({round(100 - owner_net / booking.amount * 100) if booking.amount else 0}%)",
        )
    )
    notify(
        db,
        booking.user_id,
        "Booking confirmed",
        f"Payment received for {booking.code}. Slot {booking.slot.label} at {booking.location.name} is reserved for "
        f"{booking.booking_date:%d %b} {booking.start_time}–{booking.end_time}.",
        "success",
    )
    notify(
        db,
        booking.location.owner_id,
        "New paid reservation",
        f"{booking.customer.full_name} booked slot {booking.slot.label} on {booking.booking_date:%d %b} "
        f"({booking.start_time}–{booking.end_time}) at {booking.location.name}.",
        "success",
    )
    db.commit()
    db.refresh(booking)
    broadcast_sync(
        "booking_paid",
        {"location_id": booking.location_id, "booking_code": booking.code, "status": booking.status},
    )
    return booking


def _own_booking(db: Session, code: str, user: models.User) -> models.Booking:
    booking = db.scalar(select(models.Booking).where(models.Booking.code == code.upper().strip()))
    if booking is None:
        raise HTTPException(status_code=404, detail="Booking not found")
    if booking.user_id != user.id:
        raise HTTPException(status_code=403, detail="This booking belongs to another account")
    return booking


@router.post("/verify")
def verify_payment(
    payload: schemas.PaymentVerifyIn,
    user: models.User = Depends(require_customer),
    db: Session = Depends(get_db),
):
    booking = _own_booking(db, payload.booking_code, user)
    payment = booking.payment
    if payment is None:
        raise HTTPException(status_code=400, detail="No payment record exists for this booking")
    if payment.status == "paid":
        return {"detail": "Payment already verified", "booking": dumps(serialize_booking(booking))}
    if not payload.razorpay_payment_id:
        raise HTTPException(status_code=400, detail="Missing payment id from the gateway")
    if payload.razorpay_order_id and payload.razorpay_order_id != payment.provider_order_id:
        raise HTTPException(status_code=400, detail="Order mismatch for this booking")

    if payment.mode == "live":
        if not payload.razorpay_signature or not payments.verify_payment_signature(
            payment.provider_order_id, payload.razorpay_payment_id, payload.razorpay_signature
        ):
            payment.status = "failed"
            payment.failure_reason = "Signature verification failed"
            db.commit()
            raise HTTPException(status_code=400, detail="Payment signature verification failed")
        gateway_payment = payments.fetch_payment(payload.razorpay_payment_id)
        if gateway_payment.get("status") not in ("captured", "authorized"):
            payment.status = "failed"
            payment.failure_reason = f"Gateway status: {gateway_payment.get('status')}"
            db.commit()
            raise HTTPException(status_code=402, detail="The payment was not successful at the gateway")
        method = gateway_payment.get("method")

    else:
        # Mock mode: only the funds simulation endpoint may confirm a payment.
        raise HTTPException(
            status_code=400,
            detail="Test mode is active – use the 'Simulate payment' button to confirm this booking",
        )

    booking = _confirm_paid(db, booking, payload.razorpay_payment_id, method, payment.mode)
    return {"detail": "Payment verified", "booking": dumps(serialize_booking(booking))}


@router.post("/{code}/mock-pay")
def mock_pay(
    code: str,
    payload: schemas.MockPayIn,
    user: models.User = Depends(require_customer),
    db: Session = Depends(get_db),
):
    """Test-mode payment. Refused whenever live Razorpay keys are configured."""
    if payments.PAYMENTS_LIVE:
        raise HTTPException(status_code=400, detail="Test payments are disabled because live keys are configured")
    booking = _own_booking(db, code, user)
    payment = booking.payment
    if payment is None:
        raise HTTPException(status_code=400, detail="No payment record exists for this booking")
    if payment.status == "paid":
        return {"detail": "Already paid", "booking": dumps(serialize_booking(booking))}
    if booking.status in ("cancelled", "expired"):
        raise HTTPException(status_code=409, detail="This booking hold expired – please book again")

    if payload.outcome == "failed":
        payment.status = "failed"
        payment.failure_reason = "Simulated payment failure (test mode)"
        booking.status = "cancelled"
        booking.cancelled_at = datetime.now()
        db.commit()
        broadcast_sync("booking_cancelled", {"location_id": booking.location_id, "booking_code": booking.code})
        raise HTTPException(status_code=402, detail="Test payment failed. The slot has been released.")

    if payload.outcome == "cancelled":
        payment.status = "cancelled"
        payment.failure_reason = "Customer closed the payment window (test mode)"
        booking.status = "cancelled"
        booking.cancelled_at = datetime.now()
        db.commit()
        broadcast_sync("booking_cancelled", {"location_id": booking.location_id, "booking_code": booking.code})
        raise HTTPException(status_code=402, detail="Test payment was cancelled. The slot has been released.")

    fake_id = f"pay_mock_{datetime.now():%Y%m%d%H%M%S}{booking.id}"
    booking = _confirm_paid(db, booking, fake_id, payload.method, "mock")
    return {
        "detail": "Test payment successful (no real money was charged)",
        "booking": dumps(serialize_booking(booking)),
    }


@router.get("/history")
def payment_history(
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = db.scalars(
        select(models.Payment)
        .where(models.Payment.user_id == user.id)
        .order_by(models.Payment.created_at.desc())
    ).all()
    return [
        {
            "id": row.id,
            "receipt_no": row.receipt_no,
            "amount": row.amount,
            "currency": row.currency,
            "status": row.status,
            "mode": row.mode,
            "method": row.method,
            "provider_order_id": row.provider_order_id,
            "provider_payment_id": row.provider_payment_id,
            "created_at": row.created_at.isoformat(),
            "paid_at": row.paid_at.isoformat() if row.paid_at else None,
            "booking_code": row.booking.code if row.booking else None,
            "booking_date": row.booking.booking_date.isoformat() if row.booking else None,
            "location": row.booking.location.name if row.booking and row.booking.location else None,
        }
        for row in rows
    ]


@router.post("/webhook")
async def razorpay_webhook(request: Request, db: Session = Depends(get_db)):
    raw = await request.body()
    signature = request.headers.get("x-razorpay-signature", "")
    if not payments.verify_webhook_signature(raw, signature):
        raise HTTPException(status_code=400, detail="Invalid webhook signature")
    import json

    event = json.loads(raw or b"{}")
    entity = (event.get("payload", {}).get("payment", {}) or {}).get("entity", {})
    payment_id = entity.get("id")
    order_id = entity.get("order_id")
    if not order_id:
        return {"status": "ignored"}
    payment = db.scalar(select(models.Payment).where(models.Payment.provider_order_id == order_id))
    if payment is None or payment.status == "paid":
        return {"status": "ignored"}
    if event.get("event") == "payment.captured" and payment_id:
        _confirm_paid(db, payment.booking, payment_id, entity.get("method"), "live")
        return {"status": "confirmed"}
    if event.get("event") == "payment.failed":
        payment.status = "failed"
        payment.failure_reason = entity.get("error_description", "Payment failed at gateway")
        db.commit()
        return {"status": "failed_recorded"}
    return {"status": "ignored"}
