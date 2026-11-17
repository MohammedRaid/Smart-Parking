"""Sample data so SmartPark is usable immediately after the first start."""

import itertools
from datetime import date, datetime, timedelta

from sqlalchemy import select

from . import models, payments
from .database import SessionLocal, engine, Base
from .security import hash_password
from .services import estimate_price, fmt_time, make_qr_token, minutes

DEMO_PASSWORD = "password123"
_COUNTER = itertools.count(1000)
ADMIN_PASSWORD = "Admin@123"

IMAGE_POOL = {
    "covered": "https://images.unsplash.com/photo-1590674899484-d5640e854abe?auto=format&fit=crop&w=1200&q=70",
    "open": "https://images.unsplash.com/photo-1506521781263-d8422e82f27a?auto=format&fit=crop&w=1200&q=70",
    "street": "https://images.unsplash.com/photo-1470224114660-3f6686c562eb?auto=format&fit=crop&w=1200&q=70",
    "garage": "https://images.unsplash.com/photo-1573348722427-f1d6819fdf98?auto=format&fit=crop&w=1200&q=70",
    "basement": "https://images.unsplash.com/photo-1486006920555-c77dcf18193c?auto=format&fit=crop&w=1200&q=70",
}


def _user(db, name, email, role, phone, city, password=DEMO_PASSWORD, blocked=False):
    user = models.User(
        full_name=name,
        email=email,
        phone=phone,
        city=city,
        password_hash=hash_password(password),
        role=role,
        is_blocked=blocked,
    )
    db.add(user)
    db.flush()
    return user


def _location(db, owner, name, area, city, address, lat, lng, slots, hourly, daily, monthly, images, open_time="06:00", close_time="23:00", status="approved", description=""):
    location = models.ParkingLocation(
        owner_id=owner.id,
        name=name,
        description=description,
        address=address,
        city=city,
        area=area,
        latitude=lat,
        longitude=lng,
        total_slots=slots,
        price_hourly=hourly,
        price_daily=daily,
        price_monthly=monthly,
        open_time=open_time,
        close_time=close_time,
        status=status,
    )
    location.images = images
    db.add(location)
    db.flush()
    for index in range(slots):
        db.add(models.ParkingSlot(location_id=location.id, label=f"A{index + 1}"))
    db.flush()
    return location


def _booking(db, customer, location, slot_index, booking_date, start_time, end_time, status="reserved", method="upi", vehicle="KA01AB1234"):
    slots = sorted(location.slots, key=lambda slot: slot.label)
    slot = slots[slot_index % len(slots)]
    amount = estimate_price(location, start_time, end_time)["amount"]
    code = f"SP{booking_date:%y%m%d}{location.id:02d}{next(_COUNTER)}"
    booking = models.Booking(
        code=code,
        user_id=customer.id,
        location_id=location.id,
        slot_id=slot.id,
        booking_date=booking_date,
        start_time=start_time,
        end_time=end_time,
        amount=amount,
        status=status,
        qr_token=make_qr_token(code),
        vehicle_number=vehicle,
    )
    if status in ("parked",):
        booking.checked_in_at = datetime.now() - timedelta(minutes=45)
    if status == "completed":
        booking.checked_in_at = datetime.combine(booking_date, datetime.min.time()) + timedelta(minutes=minutes(start_time))
        booking.checked_out_at = datetime.combine(booking_date, datetime.min.time()) + timedelta(minutes=minutes(end_time))
    db.add(booking)
    db.flush()
    payment = models.Payment(
        booking_id=booking.id,
        user_id=customer.id,
        amount=amount,
        currency="INR",
        provider="razorpay",
        mode=payments.mode(),
        provider_order_id=f"order_demo_{booking.id}",
        provider_payment_id=f"pay_demo_{booking.id}",
        method=method,
        status="paid",
        receipt_no=f"RCPT-{code}",
        paid_at=datetime.now() - timedelta(hours=3),
    )
    db.add(payment)
    db.flush()
    db.add(
        models.Transaction(
            payment_id=payment.id,
            booking_id=booking.id,
            user_id=customer.id,
            kind="payment",
            amount=amount,
            status="succeeded",
            reference=payment.provider_payment_id,
            note=f"{method.upper()} payment for {code}",
        )
    )
    return booking


def seed_if_empty() -> None:
    Base.metadata.create_all(engine)
    db = SessionLocal()
    try:
        if db.scalar(select(models.User.id).limit(1)):
            return

        admin = _user(db, "Aditya Rao", "admin@smartpark.in", "admin", "+91 98450 11111", "Bengaluru", ADMIN_PASSWORD)
        priya = _user(db, "Priya Nair", "priya@example.com", "customer", "+91 98450 22222", "Bengaluru")
        rahul = _user(db, "Rahul Verma", "rahul@example.com", "customer", "+91 98450 33333", "Mumbai")
        ananya = _user(db, "Ananya Iyer", "ananya@example.com", "customer", "+91 98450 44444", "Pune")
        suresh = _user(db, "Suresh Gowda", "suresh@example.com", "landowner", "+91 98450 55555", "Bengaluru")
        meera = _user(db, "Meera Joshi", "meera@example.com", "landowner", "+91 98450 66666", "Mumbai")
        imran = _user(db, "Imran Sheikh", "imran@example.com", "landowner", "+91 98450 77777", "Pune")

        mg_road = _location(
            db, suresh, "MG Road Covered Parking", "MG Road", "Bengaluru",
            "12, Trinity Circle, MG Road, Bengaluru 560001", 12.9756, 77.6067,
            12, 40, 300, 4500,
            [IMAGE_POOL["covered"], IMAGE_POOL["garage"]],
            description="Secure covered parking 200m from MG Road metro with 24x7 security and CCTV.",
        )
        indiranagar = _location(
            db, suresh, "Indiranagar Open Lot", "Indiranagar", "Bengaluru",
            "100 Feet Road, Indiranagar 2nd Stage, Bengaluru 560038", 12.9784, 77.6408,
            8, 30, 220, 3500,
            [IMAGE_POOL["open"], IMAGE_POOL["street"]],
            description="Well-lit open lot beside 100 Feet Road, easy in-and-out for cars and SUVs.",
        )
        koramangala = _location(
            db, suresh, "Koramangala Smart Park", "Koramangala", "Bengaluru",
            "5th Block, 80 Feet Road, Koramangala, Bengaluru 560095", 12.9352, 77.6245,
            16, 50, 380, 6000,
            [IMAGE_POOL["basement"], IMAGE_POOL["covered"]],
            description="Basement parking with lift access to the high street and EV charging bays.",
        )
        bandra = _location(
            db, meera, "Bandra Station Parking", "Bandra West", "Mumbai",
            "Station Road, Bandra West, Mumbai 400050", 19.0596, 72.8295,
            20, 60, 450, 7000,
            [IMAGE_POOL["street"], IMAGE_POOL["open"]],
            description="Two minutes from Bandra station west exit, attended 24 hours.",
        )
        andheri = _location(
            db, meera, "Andheri Business Bay Parking", "Andheri East", "Mumbai",
            "Chakala, Andheri East, Mumbai 400099", 19.1136, 72.8697,
            10, 45, 320, 5200,
            [IMAGE_POOL["garage"]],
            description="Corporate tower visitor parking with valet support during business hours.",
        )
        koregaon = _location(
            db, imran, "Koregaon Park Landmark Parking", "Koregaon Park", "Pune",
            "Lane 7, Koregaon Park, Pune 411001", 18.5362, 73.8939,
            6, 35, 250, 4000,
            [IMAGE_POOL["open"]],
            description="Quiet residential lane parking, gated with a caretaker on site.",
        )
        _location(
            db, suresh, "Whitefield Community Ground", "Whitefield", "Bengaluru",
            "Behind ITPL Main Road, Whitefield, Bengaluru 560066", 12.9698, 77.7500,
            25, 25, 180, 3000,
            [IMAGE_POOL["open"]],
            status="pending",
            description="Community ground converted to parking for the metro construction period.",
        )

        today = date.today()
        tomorrow = today + timedelta(days=1)
        now_minutes = datetime.now().hour * 60 + datetime.now().minute

        parked_start = fmt_time(max(6 * 60, now_minutes - 90))
        parked_end = fmt_time(min(23 * 60 - 1, max(now_minutes + 150, minutes(parked_start) + 120)))

        # MG Road: 4 vehicles currently parked -> some slots free (GREEN/ORANGE demo)
        for index in range(4):
            _booking(db, [priya, rahul, ananya][index % 3], mg_road, index, today, parked_start, parked_end, status="parked")
        # MG Road: 3 reservations for tomorrow afternoon
        for index in range(3):
            _booking(db, [priya, ananya][index % 2], mg_road, 4 + index, tomorrow, "14:00", "18:00")

        # Bandra: 7 parked vehicles out of 20
        for index in range(7):
            _booking(db, [rahul, ananya, priya][index % 3], bandra, index, today, parked_start, parked_end, status="parked")
        _booking(db, rahul, bandra, 8, tomorrow, "09:00", "12:00")

        # Koramangala: busy tomorrow morning
        for index in range(9):
            _booking(db, [priya, rahul, ananya][index % 3], koramangala, index, tomorrow, "10:00", "13:00")

        # Andheri: 1 parked, 1 later today
        _booking(db, rahul, andheri, 0, today, parked_start, parked_end, status="parked")

        # Indiranagar: tomorrow evening reservations
        for index in range(2):
            _booking(db, priya, indiranagar, index, tomorrow, "18:00", "21:00")

        # Completed history for reviews and earnings
        completed_one = _booking(db, priya, indiranagar, 3, today - timedelta(days=3), "09:00", "12:00", status="completed")
        completed_two = _booking(db, rahul, bandra, 5, today - timedelta(days=6), "16:00", "19:00", status="completed")
        completed_three = _booking(db, ananya, koregaon, 1, today - timedelta(days=9), "10:00", "13:00", status="completed")
        _booking(db, priya, mg_road, 7, today - timedelta(days=12), "11:00", "15:00", status="completed")

        db.add_all(
            [
                models.Review(location_id=indiranagar.id, user_id=priya.id, booking_id=completed_one.id, rating=5, comment="Easy entry, plenty of space and the owner was very helpful."),
                models.Review(location_id=bandra.id, user_id=rahul.id, booking_id=completed_two.id, rating=4, comment="Great location near the station, slightly tight at peak hours."),
                models.Review(location_id=koregaon.id, user_id=ananya.id, booking_id=completed_three.id, rating=5, comment="Quiet, clean and exactly where the map pin said."),
                models.Review(location_id=mg_road.id, user_id=rahul.id, rating=4, comment="Covered parking that saved me during the rains."),
                models.Review(location_id=andheri.id, user_id=ananya.id, rating=4, comment="Valet was quick, will use again for client meetings."),
            ]
        )

        db.add_all(
            [
                models.Complaint(
                    user_id=priya.id,
                    booking_id=completed_one.id,
                    location_id=indiranagar.id,
                    subject="Entry gate was locked",
                    message="I reached at 9 am and the gate was locked for 10 minutes. Please ask the owner to keep it open during booked hours.",
                    status="open",
                ),
                models.Complaint(
                    user_id=rahul.id,
                    location_id=bandra.id,
                    subject="Refund query",
                    message="I cancelled a booking and want to check the refund timeline.",
                    status="resolved",
                    admin_reply="The refund was processed to your original payment method within 5 working days.",
                ),
            ]
        )

        db.add_all(
            [
                models.Notification(user_id=priya.id, title="Welcome to SmartPark", message="Find and reserve parking in seconds.", kind="success"),
                models.Notification(user_id=suresh.id, title="Listing approved", message="'MG Road Covered Parking' is live on the map.", kind="success"),
                models.Notification(user_id=admin.id, title="Listing awaiting review", message="'Whitefield Community Ground' needs approval.", kind="info"),
            ]
        )

        db.commit()
    finally:
        db.close()
