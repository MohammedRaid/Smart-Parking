import asyncio
import contextlib

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from . import payments
from .config import CORS_ORIGINS, UPLOAD_DIR
from .database import Base, SessionLocal, engine
from .realtime import manager
from .routers import admin, auth, bookings, misc, parking
from .routers import payments as payments_router
from .seed import seed_if_empty
from .services import expire_stale_bookings


async def _expiry_loop() -> None:
    """Release slots of reservations that expired while nobody was looking."""
    while True:
        await asyncio.sleep(60)
        db = SessionLocal()
        try:
            changed = expire_stale_bookings(db)
            if changed:
                await manager.broadcast(
                    "availability_changed", {"location_ids": sorted(set(changed))}
                )
        except Exception:  # noqa: BLE001 - the loop must survive a transient DB error
            pass
        finally:
            db.close()


@contextlib.asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(engine)
    seed_if_empty()
    task = asyncio.create_task(_expiry_loop())
    try:
        yield
    finally:
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task


app = FastAPI(
    title="SmartPark API",
    description="Smart parking rental and online reservation platform",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(parking.router)
app.include_router(bookings.router)
app.include_router(payments_router.router)
app.include_router(admin.router)
app.include_router(misc.router)

app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "payments": {
            "mode": payments.mode(),
            "live_keys_configured": payments.PAYMENTS_LIVE,
            "note": (
                "Razorpay live keys are configured."
                if payments.PAYMENTS_LIVE
                else "TEST MODE: no Razorpay keys configured, payments are simulated and no money moves."
            ),
        },
        "websocket_clients": manager.active,
    }


@app.get("/")
def root():
    return {
        "name": "SmartPark API",
        "docs": "/docs",
        "health": "/api/health",
        "payments_mode": payments.mode(),
    }


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            message = await websocket.receive_text()
            if message.strip() == "ping":
                await websocket.send_text('{"event":"pong"}')
    except WebSocketDisconnect:
        await manager.disconnect(websocket)
    except Exception:  # noqa: BLE001
        await manager.disconnect(websocket)
