from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..security import get_current_user, require_admin
from ..services import ACTIVE_STATUSES

router = APIRouter(tags=["misc"])


@router.get("/api/stats")
def public_stats(db: Session = Depends(get_db)):
    def count(model, *conditions) -> int:
        return int(db.scalar(select(func.count()).select_from(model).where(*conditions)) or 0)

    return {
        "parking_spaces": int(
            db.scalar(
                select(func.coalesce(func.sum(models.ParkingLocation.total_slots), 0)).where(
                    models.ParkingLocation.status == "approved"
                )
            )
            or 0
        ),
        "locations": count(models.ParkingLocation, models.ParkingLocation.status == "approved"),
        "cities": len(
            db.scalars(
                select(models.ParkingLocation.city)
                .where(models.ParkingLocation.status == "approved")
                .distinct()
            ).all()
        ),
        "customers": count(models.User, models.User.role == "customer"),
        "landowners": count(models.User, models.User.role == "landowner"),
        "bookings": count(models.Booking),
        "active_bookings": count(models.Booking, models.Booking.status.in_(ACTIVE_STATUSES)),
    }


@router.get("/api/notifications")
def my_notifications(
    limit: int = 30,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = db.scalars(
        select(models.Notification)
        .where(models.Notification.user_id == user.id)
        .order_by(models.Notification.created_at.desc())
        .limit(min(limit, 100))
    ).all()
    return {
        "unread": len([row for row in rows if not row.is_read]),
        "items": [
            {
                "id": row.id,
                "title": row.title,
                "message": row.message,
                "kind": row.kind,
                "is_read": row.is_read,
                "created_at": row.created_at.isoformat(),
            }
            for row in rows
        ],
    }


@router.post("/api/notifications/read-all")
def read_all(user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.scalars(
        select(models.Notification).where(models.Notification.user_id == user.id)
    ).all()
    for row in rows:
        row.is_read = True
    db.commit()
    return {"detail": "All notifications marked as read"}


@router.post("/api/complaints", status_code=201)
def create_complaint(
    payload: schemas.ComplaintIn,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    complaint = models.Complaint(
        user_id=user.id,
        booking_id=payload.booking_id,
        location_id=payload.location_id,
        subject=payload.subject.strip(),
        message=payload.message.strip(),
    )
    db.add(complaint)
    db.commit()
    db.refresh(complaint)
    return {"id": complaint.id, "status": complaint.status, "detail": "Complaint submitted to the admin team"}


@router.get("/api/complaints")
def my_complaints(user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.scalars(
        select(models.Complaint)
        .where(models.Complaint.user_id == user.id)
        .order_by(models.Complaint.created_at.desc())
    ).all()
    return [
        {
            "id": row.id,
            "subject": row.subject,
            "message": row.message,
            "status": row.status,
            "admin_reply": row.admin_reply,
            "created_at": row.created_at.isoformat(),
        }
        for row in rows
    ]


@router.post("/api/reviews", status_code=201)
def create_review(
    payload: schemas.ReviewIn,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    location = db.get(models.ParkingLocation, payload.location_id)
    if location is None:
        raise HTTPException(status_code=404, detail="Parking location not found")
    if payload.booking_id:
        booking = db.get(models.Booking, payload.booking_id)
        if booking is None or booking.user_id != user.id:
            raise HTTPException(status_code=403, detail="You can only review your own bookings")
        if booking.location_id != location.id:
            raise HTTPException(status_code=400, detail="This booking belongs to a different location")
        if booking.status not in ("completed", "parked"):
            raise HTTPException(status_code=400, detail="You can review after your parking session starts")
        existing = db.scalar(
            select(models.Review).where(models.Review.booking_id == booking.id)
        )
        if existing:
            raise HTTPException(status_code=409, detail="You already reviewed this booking")
    review = models.Review(
        location_id=location.id,
        user_id=user.id,
        booking_id=payload.booking_id,
        rating=payload.rating,
        comment=payload.comment.strip(),
    )
    db.add(review)
    db.commit()
    return {"detail": "Thanks for your review"}
