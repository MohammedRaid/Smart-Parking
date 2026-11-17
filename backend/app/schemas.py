import re
from datetime import date
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator

TIME_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


def _check_time(value: str) -> str:
    if not TIME_RE.match(value or ""):
        raise ValueError("Time must be in HH:MM 24-hour format")
    return value


class RegisterIn(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)
    phone: str | None = Field(default=None, max_length=30)
    city: str | None = Field(default=None, max_length=80)
    role: Literal["customer", "landowner"] = "customer"

    @field_validator("full_name")
    @classmethod
    def _name(cls, value: str) -> str:
        value = " ".join(value.split())
        if len(value) < 2:
            raise ValueError("Please enter your full name")
        return value


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: int
    full_name: str
    email: str
    phone: str | None = None
    city: str | None = None
    role: str
    is_blocked: bool
    is_verified: bool

    class Config:
        from_attributes = True


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class ProfileUpdateIn(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=120)
    phone: str | None = Field(default=None, max_length=30)
    city: str | None = Field(default=None, max_length=80)


class PasswordChangeIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=6, max_length=128)


class LocationIn(BaseModel):
    name: str = Field(min_length=3, max_length=150)
    description: str = Field(default="", max_length=2000)
    address: str = Field(min_length=5, max_length=300)
    city: str = Field(min_length=2, max_length=80)
    area: str = Field(min_length=2, max_length=120)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    total_slots: int = Field(ge=1, le=500)
    price_hourly: float = Field(gt=0, le=100000)
    price_daily: float = Field(default=0, ge=0, le=1000000)
    price_monthly: float = Field(default=0, ge=0, le=10000000)
    open_time: str = "06:00"
    close_time: str = "23:00"
    images: list[str] = Field(default_factory=list)

    @field_validator("open_time", "close_time")
    @classmethod
    def _times(cls, value: str) -> str:
        return _check_time(value)


class LocationUpdateIn(LocationIn):
    pass


class SlotIn(BaseModel):
    label: str = Field(min_length=1, max_length=20)
    vehicle_type: Literal["car", "bike", "suv"] = "car"
    is_active: bool = True


class SlotUpdateIn(BaseModel):
    label: str | None = Field(default=None, min_length=1, max_length=20)
    vehicle_type: Literal["car", "bike", "suv"] | None = None
    is_active: bool | None = None
    is_blocked: bool | None = None


class BookingCreateIn(BaseModel):
    location_id: int
    booking_date: date
    start_time: str
    end_time: str
    vehicle_number: str | None = Field(default=None, max_length=20)

    @field_validator("start_time", "end_time")
    @classmethod
    def _times(cls, value: str) -> str:
        return _check_time(value)


class PaymentVerifyIn(BaseModel):
    booking_code: str
    razorpay_order_id: str | None = None
    razorpay_payment_id: str | None = None
    razorpay_signature: str | None = None
    method: str | None = None


class MockPayIn(BaseModel):
    method: str = "upi"
    outcome: Literal["success", "failed", "cancelled"] = "success"


class QrVerifyIn(BaseModel):
    qr_token: str
    action: Literal["check_in", "check_out", "auto"] = "auto"


class CancelIn(BaseModel):
    reason: str | None = Field(default=None, max_length=300)


class ReviewIn(BaseModel):
    location_id: int
    booking_id: int | None = None
    rating: int = Field(ge=1, le=5)
    comment: str = Field(default="", max_length=500)


class ComplaintIn(BaseModel):
    subject: str = Field(min_length=3, max_length=150)
    message: str = Field(min_length=5, max_length=2000)
    booking_id: int | None = None
    location_id: int | None = None


class ComplaintReplyIn(BaseModel):
    reply: str = Field(min_length=2, max_length=2000)
    status: Literal["open", "resolved"] = "resolved"


class RejectIn(BaseModel):
    reason: str = Field(min_length=3, max_length=300)
