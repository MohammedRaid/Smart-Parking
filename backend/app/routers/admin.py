from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..notify import notify
from ..realtime import broadcast_sync
from ..security import require_admin
from ..services import (
    ACTIVE_STATUSES,
    dumps,
    expire_stale_bookings,
    location_status,
    serialize_booking,
    serialize_location,
    split_revenue,
)

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/stats")
def dashboard_stats(user: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    expire_stale_bookings(db)

    def count(model, *conditions) -> int:
        return int(db.scalar(select(func.count()).select_from(model).where(*conditions)) or 0)

    customers = count(models.User, models.User.role == "customer")
    landowners = count(models.User, models.User.role == "landowner")
    blocked = count(models.User, models.User.is_blocked.is_(True))
    pending = count(models.ParkingLocation, models.ParkingLocation.status == "pending")
    approved = count(models.ParkingLocation, models.ParkingLocation.status == "approved")
    rejected = count(models.ParkingLocation, models.ParkingLocation.status == "rejected")

    paid_payments = db.scalars(select(models.Payment).where(models.Payment.status == "paid")).all()
    gross = round(sum(p.amount for p in paid_payments), 2)
    _, platform_revenue = split_revenue(gross)
    refunds = round(
        float(
            db.scalar(
                select(func.coalesce(func.sum(models.Booking.refund_amount), 0)).where(
                    models.Booking.refund_status == "processed"
                )
            )
            or 0
        ),
        2,
    )

    bookings_total = count(models.Booking)
    bookings_today = count(models.Booking, models.Booking.booking_date == date.today())
    parked_now = count(models.Booking, models.Booking.status == "parked")
    reserved_upcoming = count(models.Booking, models.Booking.status == "reserved")
    completed = count(models.Booking, models.Booking.status == "completed")
    cancelled = count(models.Booking, models.Booking.status == "cancelled")

    monthly: dict[str, dict] = {}
    for months_back in range(5, -1, -1):
        anchor = date.today().replace(day=1) - timedelta(days=30 * months_back)
        monthly[anchor.strftime("%Y-%m")] = {"month": anchor.strftime("%b"), "revenue": 0.0, "bookings": 0}
    for payment in paid_payments:
        key = (payment.paid_at or payment.created_at).strftime("%Y-%m")
        if key in monthly:
            monthly[key]["revenue"] = round(monthly[key]["revenue"] + payment.amount, 2)
    for booking in db.scalars(select(models.Booking)).all():
        key = booking.booking_date.strftime("%Y-%m")
        if key in monthly:
            monthly[key]["bookings"] += 1

    usage_rows = db.execute(
        select(models.ParkingLocation.name, models.ParkingLocation.city, func.count(models.Booking.id))
        .join(models.Booking, models.Booking.location_id == models.ParkingLocation.id)
        .group_by(models.ParkingLocation.id)
        .order_by(func.count(models.Booking.id).desc())
        .limit(6)
    ).all()

    recent = db.scalars(
        select(models.Booking).order_by(models.Booking.created_at.desc()).limit(8)
    ).all()

    return {
        "users": {
            "customers": customers,
            "landowners": landowners,
            "blocked": blocked,
            "total": customers + landowners + 1,
        },
        "listings": {"pending": pending, "approved": approved, "rejected": rejected},
        "bookings": {
            "total": bookings_total,
            "today": bookings_today,
            "parked": parked_now,
            "reserved": reserved_upcoming,
            "completed": completed,
            "cancelled": cancelled,
        },
        "revenue": {"gross": gross, "platform": platform_revenue, "refunds": refunds},
        "complaints_open": count(models.Complaint, models.Complaint.status == "open"),
        "monthly": list(monthly.values()),
        "top_locations": [
            {"name": row[0], "city": row[1], "bookings": row[2]} for row in usage_rows
        ],
        "recent_bookings": [dumps(serialize_booking(b)) for b in recent],
    }


@router.get("/parking")
def all_listings(
    status: str | None = Query(None, pattern="^(pending|approved|rejected)$"),
    user: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    stmt = select(models.ParkingLocation).order_by(models.ParkingLocation.created_at.desc())
    if status:
        stmt = stmt.where(models.ParkingLocation.status == status)
    rows = db.scalars(stmt).all()
    output = []
    for location in rows:
        data = serialize_location(
            location, location_status(db, location, date.today(), "09:00", "18:00")
        )
        bookings = db.scalars(
            select(models.Booking).where(models.Booking.location_id == location.id)
        ).all()
        data["stats"] = {
            "total_bookings": len(bookings),
            "revenue": round(sum(b.amount for b in bookings if b.status in ("reserved", "parked", "completed")), 2),
            "parked_now": len([b for b in bookings if b.status == "parked"]),
        }
        output.append(dumps(data))
    return output


@router.post("/parking/{location_id}/approve")
def approve_listing(location_id: int, user: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    location = db.get(models.ParkingLocation, location_id)
    if location is None:
        raise HTTPException(status_code=404, detail="Listing not found")
    location.status = "approved"
    location.rejection_reason = None
    notify(
        db,
        location.owner_id,
        "Listing approved",
        f"'{location.name}' is now live and visible to customers on the map.",
        "success",
    )
    db.commit()
    broadcast_sync("listing_updated", {"location_id": location.id})
    return {"detail": "Listing approved", "status": location.status}


@router.post("/parking/{location_id}/reject")
def reject_listing(
    location_id: int,
    payload: schemas.RejectIn,
    user: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    location = db.get(models.ParkingLocation, location_id)
    if location is None:
        raise HTTPException(status_code=404, detail="Listing not found")
    location.status = "rejected"
    location.rejection_reason = payload.reason.strip()
    notify(
        db,
        location.owner_id,
        "Listing rejected",
        f"'{location.name}' was rejected: {payload.reason}",
        "warning",
    )
    db.commit()
    broadcast_sync("listing_updated", {"location_id": location.id})
    return {"detail": "Listing rejected", "status": location.status}


@router.get("/users")
def list_users(
    role: str | None = Query(None, pattern="^(customer|landowner|admin)$"),
    q: str | None = None,
    user: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    stmt = select(models.User).order_by(models.User.created_at.desc())
    if role:
        stmt = stmt.where(models.User.role == role)
    if q:
        pattern = f"%{q.strip()}%"
        stmt = stmt.where(
            models.User.full_name.ilike(pattern) | models.User.email.ilike(pattern)
        )
    rows = db.scalars(stmt.limit(200)).all()
    output = []
    for row in rows:
        bookings = db.scalars(select(models.Booking).where(models.Booking.user_id == row.id)).all()
        output.append(
            {
                "id": row.id,
                "full_name": row.full_name,
                "email": row.email,
                "phone": row.phone,
                "role": row.role,
                "is_blocked": row.is_blocked,
                "created_at": row.created_at.isoformat(),
                "bookings": len(bookings),
                "spent": round(sum(b.amount for b in bookings if b.status in ("reserved", "parked", "completed")), 2),
                "listings": len(row.locations),
            }
        )
    return output


@router.post("/users/{user_id}/block")
def block_user(user_id: int, user: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    target = db.get(models.User, user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")
    if target.role == "admin":
        raise HTTPException(status_code=400, detail="Administrator accounts cannot be blocked")
    target.is_blocked = True
    notify(db, target.id, "Account blocked", "Your account was blocked by an administrator. Contact support.", "warning")
    db.commit()
    return {"detail": f"{target.full_name} has been blocked", "is_blocked": True}


@router.post("/users/{user_id}/unblock")
def unblock_user(user_id: int, user: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    target = db.get(models.User, user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")
    target.is_blocked = False
    notify(db, target.id, "Account restored", "Your account has been re-activated.", "success")
    db.commit()
    return {"detail": f"{target.full_name} has been unblocked", "is_blocked": False}


@router.get("/bookings")
def all_bookings(
    status: str | None = None,
    user: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    expire_stale_bookings(db)
    stmt = select(models.Booking).order_by(models.Booking.created_at.desc()).limit(200)
    if status:
        stmt = select(models.Booking).where(models.Booking.status == status).order_by(
            models.Booking.created_at.desc()
        ).limit(200)
    rows = db.scalars(stmt).all()
    return [dumps(serialize_booking(b)) for b in rows]


@router.get("/payments")
def all_payments(user: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    rows = db.scalars(
        select(models.Payment).order_by(models.Payment.created_at.desc()).limit(200)
    ).all()
    return [
        {
            "id": row.id,
            "receipt_no": row.receipt_no,
            "amount": row.amount,
            "status": row.status,
            "mode": row.mode,
            "method": row.method,
            "created_at": row.created_at.isoformat(),
            "paid_at": row.paid_at.isoformat() if row.paid_at else None,
            "booking_code": row.booking.code if row.booking else None,
            "customer": row.booking.customer.full_name if row.booking and row.booking.customer else None,
            "location": row.booking.location.name if row.booking and row.booking.location else None,
        }
        for row in rows
    ]


@router.get("/complaints")
def complaints(
    status: str | None = Query(None, pattern="^(open|resolved)$"),
    user: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    stmt = select(models.Complaint).order_by(models.Complaint.created_at.desc())
    if status:
        stmt = stmt.where(models.Complaint.status == status)
    rows = db.scalars(stmt).all()
    return [
        {
            "id": row.id,
            "subject": row.subject,
            "message": row.message,
            "status": row.status,
            "admin_reply": row.admin_reply,
            "created_at": row.created_at.isoformat(),
            "user": row.user.full_name if row.user else "Unknown",
            "email": row.user.email if row.user else "",
        }
        for row in rows
    ]


@router.post("/complaints/{complaint_id}/reply")
def reply_complaint(
    complaint_id: int,
    payload: schemas.ComplaintReplyIn,
    user: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    complaint = db.get(models.Complaint, complaint_id)
    if complaint is None:
        raise HTTPException(status_code=404, detail="Complaint not found")
    complaint.admin_reply = payload.reply.strip()
    complaint.status = payload.status
    notify(db, complaint.user_id, "Support replied to your complaint", payload.reply.strip(), "info")
    db.commit()
    return {"detail": "Reply sent", "status": complaint.status}
