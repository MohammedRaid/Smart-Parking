import json
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    full_name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(190), unique=True, index=True)
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    city: Mapped[str | None] = mapped_column(String(80), nullable=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(20), default="customer", index=True)  # customer|landowner|admin
    is_blocked: Mapped[bool] = mapped_column(Boolean, default=False)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

    locations: Mapped[list["ParkingLocation"]] = relationship(
        back_populates="owner", cascade="all, delete-orphan", lazy="selectin"
    )
    bookings: Mapped[list["Booking"]] = relationship(back_populates="customer", lazy="selectin")


class ParkingLocation(Base):
    __tablename__ = "parking_locations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(150))
    description: Mapped[str] = mapped_column(Text, default="")
    address: Mapped[str] = mapped_column(String(300))
    city: Mapped[str] = mapped_column(String(80), index=True)
    area: Mapped[str] = mapped_column(String(120), index=True)
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    total_slots: Mapped[int] = mapped_column(Integer, default=1)
    price_hourly: Mapped[float] = mapped_column(Float, default=0)
    price_daily: Mapped[float] = mapped_column(Float, default=0)
    price_monthly: Mapped[float] = mapped_column(Float, default=0)
    open_time: Mapped[str] = mapped_column(String(5), default="06:00")
    close_time: Mapped[str] = mapped_column(String(5), default="23:00")
    images_json: Mapped[str] = mapped_column(Text, default="[]")
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)  # pending|approved|rejected
    rejection_reason: Mapped[str | None] = mapped_column(String(300), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

    owner: Mapped["User"] = relationship(back_populates="locations", lazy="selectin")
    slots: Mapped[list["ParkingSlot"]] = relationship(
        back_populates="location", cascade="all, delete-orphan", lazy="selectin"
    )
    bookings: Mapped[list["Booking"]] = relationship(
        back_populates="location", cascade="all, delete-orphan"
    )
    reviews: Mapped[list["Review"]] = relationship(
        back_populates="location", cascade="all, delete-orphan", lazy="selectin"
    )

    @property
    def images(self) -> list[str]:
        try:
            data = json.loads(self.images_json or "[]")
            return [str(item) for item in data] if isinstance(data, list) else []
        except (ValueError, TypeError):
            return []

    @images.setter
    def images(self, value: list[str]) -> None:
        self.images_json = json.dumps(list(value))


class ParkingSlot(Base):
    __tablename__ = "parking_slots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    location_id: Mapped[int] = mapped_column(
        ForeignKey("parking_locations.id", ondelete="CASCADE"), index=True
    )
    label: Mapped[str] = mapped_column(String(20))
    vehicle_type: Mapped[str] = mapped_column(String(20), default="car")  # car|bike|suv
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_blocked: Mapped[bool] = mapped_column(Boolean, default=False)  # owner marked unusable
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

    location: Mapped["ParkingLocation"] = relationship(back_populates="slots")


class Booking(Base):
    __tablename__ = "bookings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    location_id: Mapped[int] = mapped_column(
        ForeignKey("parking_locations.id", ondelete="CASCADE"), index=True
    )
    slot_id: Mapped[int] = mapped_column(ForeignKey("parking_slots.id", ondelete="CASCADE"), index=True)
    booking_date: Mapped[date] = mapped_column(Date, index=True)
    start_time: Mapped[str] = mapped_column(String(5))
    end_time: Mapped[str] = mapped_column(String(5))
    amount: Mapped[float] = mapped_column(Float, default=0)
    status: Mapped[str] = mapped_column(String(20), default="pending_payment", index=True)
    # pending_payment | reserved | parked | completed | cancelled | expired
    qr_token: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    vehicle_number: Mapped[str | None] = mapped_column(String(20), nullable=True)
    checked_in_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    checked_out_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    refund_amount: Mapped[float] = mapped_column(Float, default=0)
    refund_status: Mapped[str | None] = mapped_column(String(20), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

    customer: Mapped["User"] = relationship(back_populates="bookings", lazy="selectin")
    location: Mapped["ParkingLocation"] = relationship(back_populates="bookings", lazy="selectin")
    slot: Mapped["ParkingSlot"] = relationship(lazy="selectin")
    payment: Mapped["Payment | None"] = relationship(
        back_populates="booking", uselist=False, lazy="selectin"
    )


class Payment(Base):
    __tablename__ = "payments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    booking_id: Mapped[int] = mapped_column(
        ForeignKey("bookings.id", ondelete="CASCADE"), unique=True, index=True
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    amount: Mapped[float] = mapped_column(Float)
    currency: Mapped[str] = mapped_column(String(5), default="INR")
    provider: Mapped[str] = mapped_column(String(30), default="razorpay")
    mode: Mapped[str] = mapped_column(String(10), default="mock")  # live|mock
    provider_order_id: Mapped[str] = mapped_column(String(120), index=True)
    provider_payment_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    method: Mapped[str | None] = mapped_column(String(30), nullable=True)  # upi|card|netbanking...
    status: Mapped[str] = mapped_column(String(20), default="created", index=True)
    # created | paid | failed | cancelled | refunded
    receipt_no: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    failure_reason: Mapped[str | None] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    booking: Mapped["Booking"] = relationship(back_populates="payment")
    transactions: Mapped[list["Transaction"]] = relationship(
        back_populates="payment", cascade="all, delete-orphan", lazy="selectin"
    )


class Transaction(Base):
    __tablename__ = "transactions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    payment_id: Mapped[int | None] = mapped_column(
        ForeignKey("payments.id", ondelete="CASCADE"), nullable=True, index=True
    )
    booking_id: Mapped[int | None] = mapped_column(
        ForeignKey("bookings.id", ondelete="CASCADE"), nullable=True, index=True
    )
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    kind: Mapped[str] = mapped_column(String(20), default="payment")  # payment|refund|platform_fee|payout
    amount: Mapped[float] = mapped_column(Float)
    status: Mapped[str] = mapped_column(String(20), default="succeeded")
    reference: Mapped[str] = mapped_column(String(120), default="")
    note: Mapped[str] = mapped_column(String(200), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

    payment: Mapped["Payment | None"] = relationship(back_populates="transactions")


class QrVerification(Base):
    __tablename__ = "qr_verifications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    booking_id: Mapped[int | None] = mapped_column(
        ForeignKey("bookings.id", ondelete="SET NULL"), nullable=True, index=True
    )
    scanned_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    action: Mapped[str] = mapped_column(String(20))  # check_in | check_out | invalid
    result: Mapped[str] = mapped_column(String(20), default="success")  # success | failed
    note: Mapped[str] = mapped_column(String(200), default="")
    scanned_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)


class Review(Base):
    __tablename__ = "reviews"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    location_id: Mapped[int] = mapped_column(
        ForeignKey("parking_locations.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    booking_id: Mapped[int | None] = mapped_column(
        ForeignKey("bookings.id", ondelete="SET NULL"), nullable=True
    )
    rating: Mapped[int] = mapped_column(Integer, default=5)
    comment: Mapped[str] = mapped_column(String(500), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

    location: Mapped["ParkingLocation"] = relationship(back_populates="reviews")
    user: Mapped["User"] = relationship(lazy="selectin")


class Complaint(Base):
    __tablename__ = "complaints"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    booking_id: Mapped[int | None] = mapped_column(
        ForeignKey("bookings.id", ondelete="SET NULL"), nullable=True
    )
    location_id: Mapped[int | None] = mapped_column(
        ForeignKey("parking_locations.id", ondelete="SET NULL"), nullable=True
    )
    subject: Mapped[str] = mapped_column(String(150))
    message: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="open", index=True)  # open|resolved
    admin_reply: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

    user: Mapped["User"] = relationship(lazy="selectin")


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(150))
    message: Mapped[str] = mapped_column(String(400), default="")
    kind: Mapped[str] = mapped_column(String(20), default="info")
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
