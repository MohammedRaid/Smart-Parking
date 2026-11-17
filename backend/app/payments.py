"""Razorpay REST client.

With RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET configured the calls hit the real
Razorpay API. Without keys the module runs in MOCK mode: order ids are local,
no network call is made and the UI says "Test mode" everywhere.
"""

import hashlib
import hmac
import secrets

import httpx
from fastapi import HTTPException

from .config import (
    CURRENCY,
    PAYMENTS_LIVE,
    RAZORPAY_API_BASE,
    RAZORPAY_KEY_ID,
    RAZORPAY_KEY_SECRET,
)

TIMEOUT = 20.0


def mode() -> str:
    return "live" if PAYMENTS_LIVE else "mock"


def public_key() -> str | None:
    return RAZORPAY_KEY_ID if PAYMENTS_LIVE else None


def to_paise(amount: float) -> int:
    return int(round(amount * 100))


def create_order(amount: float, receipt: str, notes: dict | None = None) -> dict:
    if not PAYMENTS_LIVE:
        return {
            "id": f"order_mock_{secrets.token_hex(8)}",
            "amount": to_paise(amount),
            "currency": CURRENCY,
            "receipt": receipt,
            "status": "created",
            "mode": "mock",
        }
    try:
        response = httpx.post(
            f"{RAZORPAY_API_BASE}/orders",
            auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET),
            json={
                "amount": to_paise(amount),
                "currency": CURRENCY,
                "receipt": receipt[:40],
                "notes": notes or {},
            },
            timeout=TIMEOUT,
        )
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Could not reach the payment gateway: {exc}") from exc
    if response.status_code >= 400:
        raise HTTPException(
            status_code=502,
            detail=f"Payment gateway rejected the order ({response.status_code}): {response.text[:200]}",
        )
    data = response.json()
    data["mode"] = "live"
    return data


def verify_payment_signature(order_id: str, payment_id: str, signature: str) -> bool:
    if not PAYMENTS_LIVE:
        return True
    expected = hmac.new(
        RAZORPAY_KEY_SECRET.encode(), f"{order_id}|{payment_id}".encode(), hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature or "")


def verify_webhook_signature(body: bytes, signature: str) -> bool:
    from .config import RAZORPAY_WEBHOOK_SECRET

    if not RAZORPAY_WEBHOOK_SECRET:
        return False
    expected = hmac.new(
        RAZORPAY_WEBHOOK_SECRET.encode(), body, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature or "")


def fetch_payment(payment_id: str) -> dict:
    if not PAYMENTS_LIVE:
        return {"id": payment_id, "status": "captured", "method": "upi", "amount": 0}
    try:
        response = httpx.get(
            f"{RAZORPAY_API_BASE}/payments/{payment_id}",
            auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET),
            timeout=TIMEOUT,
        )
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Could not verify the payment: {exc}") from exc
    if response.status_code >= 400:
        raise HTTPException(status_code=400, detail="Payment could not be found at the gateway")
    return response.json()


def create_refund(payment_id: str, amount: float, notes: dict | None = None) -> dict:
    if not PAYMENTS_LIVE:
        return {
            "id": f"rfnd_mock_{secrets.token_hex(6)}",
            "status": "processed",
            "amount": to_paise(amount),
            "mode": "mock",
        }
    try:
        response = httpx.post(
            f"{RAZORPAY_API_BASE}/payments/{payment_id}/refund",
            auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET),
            json={"amount": to_paise(amount), "notes": notes or {}, "speed": "normal"},
            timeout=TIMEOUT,
        )
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Refund request failed: {exc}") from exc
    if response.status_code >= 400:
        raise HTTPException(
            status_code=502,
            detail=f"Gateway refused the refund ({response.status_code}): {response.text[:200]}",
        )
    data = response.json()
    data["mode"] = "live"
    return data
