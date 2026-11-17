"""Application configuration loaded from environment variables (and a local .env file)."""

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent


def _load_env() -> None:
    """Minimal .env loader so the project runs without extra dependencies."""
    path = BASE_DIR / ".env"
    if not path.exists():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


_load_env()


def _env(name: str, default: str = "") -> str:
    return os.getenv(name, default) or default


DATABASE_URL = _env("DATABASE_URL", f"sqlite:///{(BASE_DIR / 'smartpark.db').as_posix()}")
JWT_SECRET = _env("JWT_SECRET", "dev-only-smartpark-secret-change-me")
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_MINUTES = int(_env("ACCESS_TOKEN_MINUTES", "1440"))
CORS_ORIGINS = [
    origin.strip()
    for origin in _env(
        "CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173"
    ).split(",")
    if origin.strip()
]

UPLOAD_DIR = BASE_DIR / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# Razorpay. When both keys are present the backend talks to the real Razorpay API,
# otherwise it runs in clearly-labelled mock mode (no real money moves).
RAZORPAY_KEY_ID = _env("RAZORPAY_KEY_ID", "")
RAZORPAY_KEY_SECRET = _env("RAZORPAY_KEY_SECRET", "")
RAZORPAY_WEBHOOK_SECRET = _env("RAZORPAY_WEBHOOK_SECRET", "")
RAZORPAY_API_BASE = _env("RAZORPAY_API_BASE", "https://api.razorpay.com/v1")
PAYMENTS_LIVE = bool(RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET)

CURRENCY = "INR"
PLATFORM_FEE_PERCENT = 10
QR_SECRET = _env("QR_SECRET", JWT_SECRET)

# Cancellation policy
FREE_CANCEL_HOURS = 2
LATE_CANCEL_REFUND_PERCENT = 50
PENDING_PAYMENT_TTL_MINUTES = 15
