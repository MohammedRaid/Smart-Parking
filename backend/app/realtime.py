"""Tiny WebSocket fan-out so every open map/dashboard updates without a refresh."""

import asyncio
import json
from typing import Any

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self) -> None:
        self._connections: set[WebSocket] = set()
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._connections.add(websocket)

    async def disconnect(self, websocket: WebSocket) -> None:
        async with self._lock:
            self._connections.discard(websocket)

    async def broadcast(self, event: str, payload: dict[str, Any] | None = None) -> None:
        message = json.dumps({"event": event, "payload": payload or {}})
        async with self._lock:
            targets = list(self._connections)
        stale: list[WebSocket] = []
        for websocket in targets:
            try:
                await websocket.send_text(message)
            except Exception:  # noqa: BLE001 - a dead socket must not break the rest
                stale.append(websocket)
        if stale:
            async with self._lock:
                for websocket in stale:
                    self._connections.discard(websocket)

    @property
    def active(self) -> int:
        return len(self._connections)


manager = ConnectionManager()


def broadcast_sync(event: str, payload: dict[str, Any] | None = None) -> None:
    """Callable from regular (sync) request handlers."""
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return
    loop.create_task(manager.broadcast(event, payload))
