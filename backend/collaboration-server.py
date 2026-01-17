"""
Real-Time Collaboration Server

WebSocket server for real-time synchronization of sessions, artifacts,
and workspace changes across multiple users.
"""

import asyncio
import json
import logging
from typing import Dict, Set
from datetime import datetime
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="LLMos-Lite Collaboration Server")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Connection management
class ConnectionManager:
    def __init__(self):
        # Map of room_id -> set of websockets
        self.rooms: Dict[str, Set[WebSocket]] = {}
        # Map of websocket -> user_id
        self.connections: Dict[WebSocket, str] = {}
        # Map of websocket -> room_id
        self.user_rooms: Dict[WebSocket, str] = {}

    async def connect(self, websocket: WebSocket, user_id: str):
        """Accept new WebSocket connection"""
        await websocket.accept()
        self.connections[websocket] = user_id
        logger.info(f"User {user_id} connected")

    def disconnect(self, websocket: WebSocket):
        """Handle WebSocket disconnection"""
        user_id = self.connections.get(websocket)
        room_id = self.user_rooms.get(websocket)

        # Remove from room
        if room_id and room_id in self.rooms:
            self.rooms[room_id].discard(websocket)
            if not self.rooms[room_id]:
                del self.rooms[room_id]

        # Remove from tracking
        if websocket in self.connections:
            del self.connections[websocket]
        if websocket in self.user_rooms:
            del self.user_rooms[websocket]

        logger.info(f"User {user_id} disconnected from room {room_id}")

    async def join_room(self, websocket: WebSocket, room_id: str):
        """Add user to collaboration room"""
        # Leave previous room if any
        await self.leave_room(websocket)

        # Join new room
        if room_id not in self.rooms:
            self.rooms[room_id] = set()

        self.rooms[room_id].add(websocket)
        self.user_rooms[websocket] = room_id

        user_id = self.connections[websocket]
        logger.info(f"User {user_id} joined room {room_id}")

        # Notify other users
        await self.broadcast_to_room(room_id, {
            "type": "event",
            "event": {
                "type": "user_joined",
                "userId": user_id,
                "userName": user_id,
            }
        }, exclude=websocket)

    async def leave_room(self, websocket: WebSocket):
        """Remove user from current room"""
        room_id = self.user_rooms.get(websocket)
        if not room_id:
            return

        user_id = self.connections[websocket]

        # Remove from room
        if room_id in self.rooms:
            self.rooms[room_id].discard(websocket)

        # Remove tracking
        del self.user_rooms[websocket]

        # Notify other users
        await self.broadcast_to_room(room_id, {
            "type": "event",
            "event": {
                "type": "user_left",
                "userId": user_id,
            }
        })

        logger.info(f"User {user_id} left room {room_id}")

    async def broadcast_to_room(self, room_id: str, message: dict, exclude: WebSocket = None):
        """Broadcast message to all users in room"""
        if room_id not in self.rooms:
            return

        dead_connections = []

        for connection in self.rooms[room_id]:
            if connection == exclude:
                continue

            try:
                await connection.send_json(message)
            except Exception as e:
                logger.error(f"Error sending to connection: {e}")
                dead_connections.append(connection)

        # Clean up dead connections
        for connection in dead_connections:
            self.disconnect(connection)

    async def send_to_user(self, websocket: WebSocket, message: dict):
        """Send message to specific user"""
        try:
            await websocket.send_json(message)
        except Exception as e:
            logger.error(f"Error sending to user: {e}")
            self.disconnect(websocket)

    def get_room_users(self, room_id: str) -> list:
        """Get list of users in room"""
        if room_id not in self.rooms:
            return []

        return [
            {
                "userId": self.connections[ws],
                "userName": self.connections[ws],
            }
            for ws in self.rooms[room_id]
        ]


manager = ConnectionManager()


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """Main WebSocket endpoint"""
    user_id = None

    try:
        # Accept connection (authentication happens after)
        await websocket.accept()

        # Wait for auth message
        auth_data = await websocket.receive_json()

        if auth_data.get("type") != "auth":
            await websocket.close(code=1008, reason="Authentication required")
            return

        user_id = auth_data.get("userId")
        if not user_id:
            await websocket.close(code=1008, reason="User ID required")
            return

        # Complete connection setup
        manager.connections[websocket] = user_id
        logger.info(f"User {user_id} authenticated")

        # Send welcome message
        await manager.send_to_user(websocket, {
            "type": "welcome",
            "userId": user_id,
            "timestamp": datetime.utcnow().isoformat(),
        })

        # Main message loop
        while True:
            data = await websocket.receive_json()
            await handle_message(websocket, data)

    except WebSocketDisconnect:
        logger.info(f"User {user_id} disconnected normally")
        manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket error for user {user_id}: {e}")
        manager.disconnect(websocket)


async def handle_message(websocket: WebSocket, data: dict):
    """Handle incoming WebSocket message"""
    message_type = data.get("type")

    if message_type == "ping":
        # Heartbeat
        await manager.send_to_user(websocket, {"type": "pong"})

    elif message_type == "join_room":
        # Join collaboration room
        room_id = data.get("roomId")
        if room_id:
            await manager.join_room(websocket, room_id)

            # Send current room state
            users = manager.get_room_users(room_id)
            await manager.send_to_user(websocket, {
                "type": "room_state",
                "roomId": room_id,
                "users": users,
            })

    elif message_type == "leave_room":
        # Leave current room
        await manager.leave_room(websocket)

    elif message_type == "broadcast":
        # Broadcast event to room
        room_id = data.get("roomId")
        event = data.get("event")

        if room_id and event:
            await manager.broadcast_to_room(room_id, {
                "type": "event",
                "event": event,
            }, exclude=websocket)

    else:
        logger.warning(f"Unknown message type: {message_type}")


@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "status": "ok",
        "service": "LLMos-Lite Collaboration Server",
        "rooms": len(manager.rooms),
        "connections": len(manager.connections),
    }


@app.get("/rooms")
async def get_rooms():
    """Get all active rooms"""
    return {
        "rooms": [
            {
                "roomId": room_id,
                "users": manager.get_room_users(room_id),
            }
            for room_id in manager.rooms.keys()
        ]
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=3001,
        log_level="info",
        ws_ping_interval=30,
        ws_ping_timeout=10,
    )
