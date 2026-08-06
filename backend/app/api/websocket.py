import json
from datetime import datetime, timezone
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import List, Dict
import asyncio

router = APIRouter(tags=["WebSocket"])


class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []
        self.connection_info: Dict[WebSocket, dict] = {}

    async def connect(self, websocket: WebSocket, client_type: str = "admin"):
        await websocket.accept()
        self.active_connections.append(websocket)
        self.connection_info[websocket] = {
            "type": client_type,
            "connected_at": datetime.now(timezone.utc).isoformat(),
        }
        print(f"[WS] Client connected: {client_type} (total: {len(self.active_connections)})")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        if websocket in self.connection_info:
            del self.connection_info[websocket]
        print(f"[WS] Client disconnected (total: {len(self.active_connections)})")

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
        message = json.dumps({
            "type": "incident",
            "action": incident_data.get("action", "created"),
            "data": incident_data,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
        await self.broadcast(message)

    async def broadcast_weather(self, weather_data: dict):
        message = json.dumps({
            "type": "weather",
            "data": weather_data,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
        await self.broadcast(message)

    async def broadcast_alert(self, alert_data: dict):
        message = json.dumps({
            "type": "alert",
            "data": alert_data,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
        await self.broadcast(message)

    async def broadcast_risk_update(self, risk_data: dict):
        message = json.dumps({
            "type": "risk_update",
            "data": risk_data,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
        await self.broadcast(message)

    def get_connection_count(self) -> int:
        return len(self.active_connections)


manager = ConnectionManager()


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, client_type: str = "admin"):
    await manager.connect(websocket, client_type)
    try:
        while True:
            data = await websocket.receive_text()
            try:
                message = json.loads(data)
                msg_type = message.get("type", "")

                if msg_type == "ping":
                    await manager.send_personal_message(json.dumps({"type": "pong", "timestamp": datetime.now(timezone.utc).isoformat()}), websocket)
                elif msg_type == "subscribe":
                    await manager.send_personal_message(json.dumps({"type": "subscribed", "channels": message.get("channels", []), "timestamp": datetime.now(timezone.utc).isoformat()}), websocket)
                elif msg_type == "incident_update":
                    await manager.broadcast_incident(message.get("data", {}))
                elif msg_type == "location_update":
                    await manager.broadcast(json.dumps({"type": "location", "data": message.get("data", {}), "timestamp": datetime.now(timezone.utc).isoformat()}))

            except json.JSONDecodeError:
                await manager.send_personal_message(json.dumps({"type": "error", "message": "Invalid JSON"}), websocket)

    except WebSocketDisconnect:
        manager.disconnect(websocket)


@router.get("/ws/status")
async def ws_status():
    return {"active_connections": manager.get_connection_count()}
