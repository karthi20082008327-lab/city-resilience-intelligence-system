import json
import logging
from datetime import UTC, datetime

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)

router = APIRouter(tags=["WebSocket"])

MAX_MESSAGE_BYTES = 8 * 1024 * 1024  # 8 MB hard cap per frame/message
HEARTBEAT_IDLE_SECONDS = 5 * 60


class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []
        self.connection_info: dict[WebSocket, dict] = {}

    async def connect(self, websocket: WebSocket, client_type: str = "admin"):
        await websocket.accept()
        self.active_connections.append(websocket)
        self.connection_info[websocket] = {
            "type": client_type,
            "connected_at": datetime.now(UTC).isoformat(),
            "last_activity": datetime.now(UTC),
        }
        logger.info("[WS] Client connected: %s (total: %d)", client_type, len(self.active_connections))

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        if websocket in self.connection_info:
            del self.connection_info[websocket]
        logger.info("[WS] Client disconnected (total: %d)", len(self.active_connections))

    def touch(self, websocket: WebSocket):
        if websocket in self.connection_info:
            self.connection_info[websocket]["last_activity"] = datetime.now(UTC)

    def is_stale(self, websocket: WebSocket) -> bool:
        info = self.connection_info.get(websocket)
        if not info:
            return False
        delta = (datetime.now(UTC) - info["last_activity"]).total_seconds()
        return delta > HEARTBEAT_IDLE_SECONDS

    async def send_personal_message(self, message: str, websocket: WebSocket):
        try:
            await websocket.send_text(message)
        except Exception:
            pass

    async def broadcast(self, message: str, exclude: WebSocket = None):
        disconnected = []
        for connection in self.active_connections:
            if connection != exclude:
                try:
                    await connection.send_text(message)
                except Exception:
                    disconnected.append(connection)
        for conn in disconnected:
            self.disconnect(conn)

    async def broadcast_incident(self, incident_data: dict):
        message = json.dumps(
            {
                "type": "incident",
                "action": incident_data.get("action", "created"),
                "data": incident_data,
                "timestamp": datetime.now(UTC).isoformat(),
            }
        )
        await self.broadcast(message)

    async def broadcast_camera_focus(self, camera_focus_data: dict):
        message = json.dumps(
            {
                "type": "camera_focus",
                "data": camera_focus_data,
                "timestamp": datetime.now(UTC).isoformat(),
            }
        )
        await self.broadcast(message)

    async def broadcast_weather(self, weather_data: dict):
        message = json.dumps(
            {
                "type": "weather",
                "data": weather_data,
                "timestamp": datetime.now(UTC).isoformat(),
            }
        )
        await self.broadcast(message)

    async def broadcast_alert(self, alert_data: dict):
        message = json.dumps(
            {
                "type": "alert",
                "data": alert_data,
                "timestamp": datetime.now(UTC).isoformat(),
            }
        )
        await self.broadcast(message)

    async def broadcast_risk_update(self, risk_data: dict):
        message = json.dumps(
            {
                "type": "risk_update",
                "data": risk_data,
                "timestamp": datetime.now(UTC).isoformat(),
            }
        )
        await self.broadcast(message)

    def get_connection_count(self) -> int:
        return len(self.active_connections)


manager = ConnectionManager()


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, client_type: str = Query(default="admin")):
    # Reject obviously malformed client types early.
    allowed_types = {"admin", "mobile", "camera"}
    safe_type = client_type if client_type in allowed_types else "admin"

    await manager.connect(websocket, safe_type)
    try:
        while True:
            data = await websocket.receive_text()

            # Enforce a maximum message size to avoid memory abuse.
            if len(data.encode("utf-8")) > MAX_MESSAGE_BYTES:
                await manager.send_personal_message(
                    json.dumps({"type": "error", "message": "Message too large"}), websocket
                )
                continue

            manager.touch(websocket)
            try:
                message = json.loads(data)
                msg_type = message.get("type", "")

                # Client heartbeat avoiding stale connections. The client sends a
                # "ping" at least every few minutes; if it goes silent beyond the
                # idle window, drop the connection.
                if manager.is_stale(websocket):
                    await websocket.close()
                    break

                if msg_type == "ping":
                    await manager.send_personal_message(
                        json.dumps({"type": "pong", "timestamp": datetime.now(UTC).isoformat()}),
                        websocket,
                    )
                elif msg_type == "subscribe":
                    await manager.send_personal_message(
                        json.dumps(
                            {
                                "type": "subscribed",
                                "channels": message.get("channels", []),
                                "timestamp": datetime.now(UTC).isoformat(),
                            }
                        ),
                        websocket,
                    )
                elif msg_type == "incident_update":
                    await manager.broadcast_incident(message.get("data", {}))
                elif msg_type == "camera_focus":
                    await manager.broadcast_camera_focus(message.get("data", {}))
                elif msg_type == "location_update":
                    await manager.broadcast(
                        json.dumps(
                            {
                                "type": "location",
                                "data": message.get("data", {}),
                                "timestamp": datetime.now(UTC).isoformat(),
                            }
                        )
                    )
                elif msg_type == "bye":
                    await websocket.close()
                    break

            except json.JSONDecodeError:
                await manager.send_personal_message(json.dumps({"type": "error", "message": "Invalid JSON"}), websocket)

    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        logger.exception("[WS] Unexpected error, disconnecting")
        manager.disconnect(websocket)


@router.get("/ws/status")
async def ws_status():
    return {
        "active_connections": manager.get_connection_count(),
        "connections": [
            {
                "type": info.get("type"),
                "connected_at": info.get("connected_at"),
            }
            for info in manager.connection_info.values()
        ],
    }
