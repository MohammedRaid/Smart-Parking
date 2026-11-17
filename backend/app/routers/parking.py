import secrets
from datetime import date, datetime
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from .. import models, schemas
from ..config import UPLOAD_DIR
from ..database import get_db
from ..notify import notify
from ..realtime import broadcast_sync
from ..security import get_current_user, require_landowner
from ..services import (
    ACTIVE_STATUSES,
    dumps,
    expire_stale_bookings,
    haversine_km,
    location_status,
    overlaps,
    serialize_location,
)

router = APIRouter(tags=["parking"])

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_IMAGE_BYTES = 5 * 1024 * 1024


def _approved_query():
    return select(models.ParkingLocation).where(models.ParkingLocation.status == "approved")


@router.get("/api/parking")
def search_parking(
    city: str | None = None,
    area: str | None = None,
    q: str | None = None,
    booking_date: date | None = None,
    start_time: str = "09:00",
    end_time: str = "12:00",
    lat: float | None = None,
    lng: float | None = None,
    radius_km: float | None = None,
    available_only: bool = False,
    sort: str = Query("distance", pattern="^(distance|price|rating)$"),
    db: Session = Depends(get_db),
):
    changed = expire_stale_bookings(db)
    if changed:
        broadcast_sync("availability_changed", {"location_ids": sorted(set(changed))})

    day = booking_date or date.today()
    stmt = _approved_query()
    if city:
        stmt = stmt.where(models.ParkingLocation.city.ilike(f"%{city.strip()}%"))
    if area:
        stmt = stmt.where(models.ParkingLocation.area.ilike(f"%{area.strip()}%"))
    if q:
        pattern = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                models.ParkingLocation.name.ilike(pattern),
                models.ParkingLocation.address.ilike(pattern),
                models.ParkingLocation.city.ilike(pattern),
                models.ParkingLocation.area.ilike(pattern),
            )
        )

    locations = db.scalars(stmt.limit(200)).all()
    results = []
    for location in locations:
        availability = location_status(db, location, day, start_time, end_time)
        if available_only and availability["available_slots"] == 0:
            continue
        distance = None
        if lat is not None and lng is not None:
            distance = haversine_km(lat, lng, location.latitude, location.longitude)
            if radius_km and distance > radius_km:
                continue
        results.append(serialize_location(location, availability, distance))

    if sort == "price":
        results.sort(key=lambda row: row["price_hourly"])
    elif sort == "rating":
        results.sort(key=lambda row: row["rating"]["average"], reverse=True)
    else:
        results.sort(key=lambda row: (row["distance_km"] is None, row["distance_km"] or 0))

    return {"count": len(results), "date": day.isoformat(), "results": results}


@router.get("/api/parking/cities")
def cities(db: Session = Depends(get_db)):
    rows = db.scalars(_approved_query()).all()
    return sorted({row.city for row in rows})


@router.get("/api/parking/{location_id}")
def parking_detail(
    location_id: int,
    booking_date: date | None = None,
    start_time: str = "09:00",
    end_time: str = "12:00",
    lat: float | None = None,
    lng: float | None = None,
    db: Session = Depends(get_db),
):
    location = db.get(models.ParkingLocation, location_id)
    if location is None:
        raise HTTPException(status_code=404, detail="Parking location not found")
    if location.status != "approved":
        raise HTTPException(status_code=404, detail="This parking location is not available")
    day = booking_date or date.today()
    availability = location_status(db, location, day, start_time, end_time)
    distance = haversine_km(lat, lng, location.latitude, location.longitude) if lat is not None and lng is not None else None
    data = serialize_location(location, availability, distance)
    data["slots"] = [
        {
            "id": slot.id,
            "label": slot.label,
            "vehicle_type": slot.vehicle_type,
            "is_active": slot.is_active,
            "is_blocked": slot.is_blocked,
            "is_free": slot.id in availability["free_slot_ids"],
        }
        for slot in sorted(location.slots, key=lambda s: s.label)
    ]
    data["reviews"] = [
        {
            "id": review.id,
            "rating": review.rating,
            "comment": review.comment,
            "user": review.user.full_name if review.user else "Customer",
            "created_at": review.created_at.isoformat(),
        }
        for review in sorted(location.reviews, key=lambda r: r.created_at, reverse=True)[:10]
    ]
    return dumps(data)


# --------------------------------------------------------------------------- #
# Landowner listing management
# --------------------------------------------------------------------------- #
def _own_location(db: Session, location_id: int, owner_id: int) -> models.ParkingLocation:
    location = db.get(models.ParkingLocation, location_id)
    if location is None:
        raise HTTPException(status_code=404, detail="Parking location not found")
    if location.owner_id != owner_id:
        raise HTTPException(status_code=403, detail="This listing belongs to another landowner")
    return location


def _add_slots(db: Session, location: models.ParkingLocation, count: int) -> None:
    existing = len(location.slots)
    prefix = "B" if location.id % 2 else "A"
    for index in range(existing, existing + count):
        db.add(
            models.ParkingSlot(
                location_id=location.id,
                label=f"{prefix}{index + 1}",
                vehicle_type="car",
            )
        )


def _sync_slots(db: Session, location: models.ParkingLocation, target: int) -> None:
    active = [slot for slot in location.slots if slot.is_active]
    if len(active) < target:
        _add_slots(db, location, target - len(active))
        return
    if len(active) > target:
        removable = sorted(active, key=lambda slot: slot.id)[target:]
        busy_ids = set(
            db.scalars(
                select(models.Booking.slot_id).where(
                    models.Booking.location_id == location.id,
                    models.Booking.status.in_(ACTIVE_STATUSES),
                )
            ).all()
        )
        for slot in removable:
            if slot.id in busy_ids:
                continue
            db.delete(slot)


@router.get("/api/landowner/locations")
def my_locations(user: models.User = Depends(require_landowner), db: Session = Depends(get_db)):
    rows = db.scalars(
        select(models.ParkingLocation)
        .where(models.ParkingLocation.owner_id == user.id)
        .order_by(models.ParkingLocation.created_at.desc())
    ).all()
    today = date.today()
    result = []
    for location in rows:
        availability = location_status(db, location, today, "09:00", "18:00")
        result.append(serialize_location(location, availability))
    return result


@router.post("/api/landowner/locations", status_code=201)
def create_location(
    payload: schemas.LocationIn,
    user: models.User = Depends(require_landowner),
    db: Session = Depends(get_db),
):
    if payload.open_time >= payload.close_time:
        raise HTTPException(status_code=400, detail="Closing time must be after opening time")
    location = models.ParkingLocation(
        owner_id=user.id,
        name=payload.name.strip(),
        description=payload.description.strip(),
        address=payload.address.strip(),
        city=payload.city.strip(),
        area=payload.area.strip(),
        latitude=payload.latitude,
        longitude=payload.longitude,
        total_slots=payload.total_slots,
        price_hourly=payload.price_hourly,
        price_daily=payload.price_daily or round(payload.price_hourly * 8, 2),
        price_monthly=payload.price_monthly or round(payload.price_hourly * 8 * 26, 2),
        open_time=payload.open_time,
        close_time=payload.close_time,
        status="pending",
    )
    location.images = payload.images[:8]
    db.add(location)
    db.flush()
    _add_slots(db, location, payload.total_slots)
    notify(db, user.id, "Listing submitted", f"'{location.name}' is awaiting admin approval.", "info")
    db.commit()
    db.refresh(location)
    broadcast_sync("listing_created", {"location_id": location.id})
    return dumps(serialize_location(location, location_status(db, location, date.today(), "09:00", "18:00")))


@router.put("/api/landowner/locations/{location_id}")
def update_location(
    location_id: int,
    payload: schemas.LocationIn,
    user: models.User = Depends(require_landowner),
    db: Session = Depends(get_db),
):
    location = _own_location(db, location_id, user.id)
    if payload.open_time >= payload.close_time:
        raise HTTPException(status_code=400, detail="Closing time must be after opening time")
    location.name = payload.name.strip()
    location.description = payload.description.strip()
    location.address = payload.address.strip()
    location.city = payload.city.strip()
    location.area = payload.area.strip()
    location.latitude = payload.latitude
    location.longitude = payload.longitude
    location.price_hourly = payload.price_hourly
    location.price_daily = payload.price_daily or location.price_daily
    location.price_monthly = payload.price_monthly or location.price_monthly
    location.open_time = payload.open_time
    location.close_time = payload.close_time
    location.images = payload.images[:8]
    location.total_slots = payload.total_slots
    _sync_slots(db, location, payload.total_slots)
    db.commit()
    db.refresh(location)
    broadcast_sync("listing_updated", {"location_id": location.id})
    return dumps(serialize_location(location, location_status(db, location, date.today(), "09:00", "18:00")))


@router.delete("/api/landowner/locations/{location_id}")
def delete_location(
    location_id: int,
    user: models.User = Depends(require_landowner),
    db: Session = Depends(get_db),
):
    location = _own_location(db, location_id, user.id)
    busy = db.scalar(
        select(models.Booking.id).where(
            models.Booking.location_id == location.id,
            models.Booking.status.in_(ACTIVE_STATUSES),
        )
    )
    if busy:
        raise HTTPException(
            status_code=400,
            detail="This listing has active or upcoming bookings. Cancel them before removing it.",
        )
    db.delete(location)
    db.commit()
    broadcast_sync("listing_deleted", {"location_id": location_id})
    return {"detail": "Parking location removed"}


# --------------------------------------------------------------------------- #
# Slots
# --------------------------------------------------------------------------- #
@router.get("/api/landowner/locations/{location_id}/slots")
def location_slots(
    location_id: int,
    user: models.User = Depends(require_landowner),
    db: Session = Depends(get_db),
):
    location = _own_location(db, location_id, user.id)
    today = date.today()
    active_bookings = db.scalars(
        select(models.Booking).where(
            models.Booking.location_id == location.id,
            models.Booking.status.in_(ACTIVE_STATUSES),
        )
    ).all()
    parked = {b.slot_id: b for b in active_bookings if b.status == "parked"}
    upcoming = {}
    for booking in active_bookings:
        if booking.status == "reserved":
            upcoming[booking.slot_id] = booking
    payload = []
    for slot in sorted(location.slots, key=lambda s: s.label):
        if slot.id in parked:
            state = "occupied"
            booking = parked[slot.id]
        elif slot.id in upcoming:
            state = "reserved"
            booking = upcoming[slot.id]
        elif not slot.is_active or slot.is_blocked:
            state = "unavailable"
            booking = None
        else:
            state = "free"
            booking = None
        payload.append(
            {
                "id": slot.id,
                "label": slot.label,
                "vehicle_type": slot.vehicle_type,
                "is_active": slot.is_active,
                "is_blocked": slot.is_blocked,
                "state": state,
                "booking": (
                    {
                        "code": booking.code,
                        "booking_date": booking.booking_date.isoformat(),
                        "start_time": booking.start_time,
                        "end_time": booking.end_time,
                        "customer": booking.customer.full_name if booking.customer else None,
                    }
                    if booking
                    else None
                ),
            }
        )
    return {
        "location": {"id": location.id, "name": location.name, "total_slots": location.total_slots},
        "slots": payload,
        "summary": location_status(db, location, today, "09:00", "18:00"),
    }


@router.post("/api/landowner/locations/{location_id}/slots", status_code=201)
def add_slot(
    location_id: int,
    payload: schemas.SlotIn,
    user: models.User = Depends(require_landowner),
    db: Session = Depends(get_db),
):
    location = _own_location(db, location_id, user.id)
    slot = models.ParkingSlot(
        location_id=location.id,
        label=payload.label.strip(),
        vehicle_type=payload.vehicle_type,
        is_active=payload.is_active,
    )
    db.add(slot)
    location.total_slots = (location.total_slots or 0) + 1
    db.commit()
    db.refresh(slot)
    broadcast_sync("availability_changed", {"location_ids": [location.id]})
    return {"id": slot.id, "label": slot.label, "vehicle_type": slot.vehicle_type, "is_active": slot.is_active}


@router.patch("/api/slots/{slot_id}")
def update_slot(
    slot_id: int,
    payload: schemas.SlotUpdateIn,
    user: models.User = Depends(require_landowner),
    db: Session = Depends(get_db),
):
    slot = db.get(models.ParkingSlot, slot_id)
    if slot is None:
        raise HTTPException(status_code=404, detail="Slot not found")
    location = _own_location(db, slot.location_id, user.id)
    if payload.label is not None:
        slot.label = payload.label.strip()
    if payload.vehicle_type is not None:
        slot.vehicle_type = payload.vehicle_type
    if payload.is_active is not None:
        slot.is_active = payload.is_active
    if payload.is_blocked is not None:
        slot.is_blocked = payload.is_blocked
    db.commit()
    broadcast_sync("availability_changed", {"location_ids": [location.id]})
    return {
        "id": slot.id,
        "label": slot.label,
        "vehicle_type": slot.vehicle_type,
        "is_active": slot.is_active,
        "is_blocked": slot.is_blocked,
    }


@router.delete("/api/slots/{slot_id}")
def delete_slot(
    slot_id: int,
    user: models.User = Depends(require_landowner),
    db: Session = Depends(get_db),
):
    slot = db.get(models.ParkingSlot, slot_id)
    if slot is None:
        raise HTTPException(status_code=404, detail="Slot not found")
    location = _own_location(db, slot.location_id, user.id)
    busy = db.scalar(
        select(models.Booking.id).where(
            models.Booking.slot_id == slot.id,
            models.Booking.status.in_(ACTIVE_STATUSES),
        )
    )
    if busy:
        raise HTTPException(status_code=400, detail="This slot has an active or upcoming booking")
    db.delete(slot)
    location.total_slots = max(0, (location.total_slots or 1) - 1)
    db.commit()
    broadcast_sync("availability_changed", {"location_ids": [location.id]})
    return {"detail": "Slot removed"}


# --------------------------------------------------------------------------- #
# Image upload
# --------------------------------------------------------------------------- #
@router.post("/api/uploads", status_code=201)
async def upload_image(
    file: UploadFile = File(...),
    user: models.User = Depends(get_current_user),
):
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail="Only JPG, PNG or WebP images are allowed")
    data = await file.read()
    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=400, detail="Image must be smaller than 5 MB")
    suffix = Path(file.filename or "image.jpg").suffix.lower()
    if suffix not in {".jpg", ".jpeg", ".png", ".webp"}:
        suffix = ".jpg"
    name = f"{datetime.now():%Y%m%d%H%M%S}_{secrets.token_hex(4)}{suffix}"
    (UPLOAD_DIR / name).write_bytes(data)
    return {"url": f"/uploads/{name}"}
