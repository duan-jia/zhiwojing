"""Server-authoritative state for the shared isometric world."""

from __future__ import annotations

import asyncio
import hashlib
import math
import random
import time
import uuid
from dataclasses import dataclass, field
from typing import Any

from fastapi import WebSocket

MAP_WIDTH = 100
MAP_HEIGHT = 100
SPAWN = (MAP_WIDTH // 2 + 0.5, MAP_HEIGHT // 2 + 0.5)
PLAYER_RADIUS = 0.22
PLAYER_SPEED = 3.5  # grid cells per second
MOVE_TICK = 0.05
MOVE_RATE_LIMIT = 60


def generate_world(seed: int) -> dict[str, Any]:
    rng = random.Random(seed)
    water = [
        (3 + rng.random() * (MAP_WIDTH - 6), 3 + rng.random() * (MAP_HEIGHT - 6),
         2.2 + rng.random() * 2.8, 1.6 + rng.random() * 2.5)
        for _ in range(5)
    ]
    dirt = [
        (2 + rng.random() * (MAP_WIDTH - 4), 2 + rng.random() * (MAP_HEIGHT - 4),
         1.8 + rng.random() * 3.4, 1.4 + rng.random() * 2.8)
        for _ in range(7)
    ]

    def inside(x: int, y: int, patch: tuple[float, ...], jitter: float) -> bool:
        px, py, rx, ry = patch
        return ((x - px) / rx) ** 2 + ((y - py) / ry) ** 2 + jitter < 1

    cells = []
    for y in range(MAP_HEIGHT):
        row = []
        for x in range(MAP_WIDTH):
            jitter = (rng.random() - 0.5) * 0.34
            near_spawn = math.hypot(x - MAP_WIDTH // 2, y - MAP_HEIGHT // 2) < 3.2
            ground = "grass"
            if not near_spawn and any(inside(x, y, patch, jitter) for patch in water):
                ground = "water"
            elif any(inside(x, y, patch, jitter) for patch in dirt):
                ground = "dirt"
            obj = None
            if not near_spawn and ground != "water":
                roll = rng.random()
                obj = "tree" if roll < 0.075 else "stone" if roll < 0.11 else None
            row.append({"ground": ground, "object": obj, "variant": rng.randrange(3)})
        cells.append(row)
    return {"width": MAP_WIDTH, "height": MAP_HEIGHT, "seed": seed, "cells": cells}


@dataclass
class Avatar:
    id: str
    name: str
    x: float
    y: float
    last_move_at: float = field(default_factory=time.monotonic, repr=False)

    def json(self) -> dict[str, Any]:
        return {"id": self.id, "name": self.name, "x": self.x, "y": self.y}


@dataclass
class World:
    id: str
    map: dict[str, Any]
    avatars: dict[str, Avatar] = field(default_factory=dict)
    sockets: dict[str, WebSocket] = field(default_factory=dict)
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)

    def can_occupy(self, x: float, y: float) -> bool:
        for sx, sy in ((x, y), (x - PLAYER_RADIUS, y), (x + PLAYER_RADIUS, y),
                       (x, y - PLAYER_RADIUS), (x, y + PLAYER_RADIUS)):
            cx, cy = math.floor(sx), math.floor(sy)
            if cx < 0 or cy < 0 or cx >= MAP_WIDTH or cy >= MAP_HEIGHT:
                return False
            cell = self.map["cells"][cy][cx]
            if cell["ground"] == "water" or cell["object"] is not None:
                return False
        return True

    def move(self, avatar_id: str, dx: float, dy: float, now: float | None = None) -> Avatar:
        avatar = self.avatars[avatar_id]
        now = time.monotonic() if now is None else now
        elapsed = min(max(now - avatar.last_move_at, 0.0), 0.1)
        avatar.last_move_at = max(avatar.last_move_at, now)
        length = math.hypot(dx, dy)
        if length:
            dx, dy = dx / length, dy / length
        distance = PLAYER_SPEED * min(max(elapsed, 0.0), 0.1)
        next_x, next_y = avatar.x + dx * distance, avatar.y + dy * distance
        if self.can_occupy(next_x, avatar.y):
            avatar.x = next_x
        if self.can_occupy(avatar.x, next_y):
            avatar.y = next_y
        return avatar

    async def broadcast(self, message: dict[str, Any]) -> None:
        failed = []
        for avatar_id, socket in list(self.sockets.items()):
            try:
                await socket.send_json(message)
            except Exception:
                failed.append(avatar_id)
        for avatar_id in failed:
            self.sockets.pop(avatar_id, None)
            self.avatars.pop(avatar_id, None)
        # A failed send is also a disconnect. Tell healthy peers immediately so
        # they do not retain a ghost avatar until their own reconnect.
        for avatar_id in failed:
            leave = {"type": "leave", "avatarId": avatar_id}
            for socket in list(self.sockets.values()):
                try:
                    await socket.send_json(leave)
                except Exception:
                    # The next broadcast (or its handler's finally block) will
                    # reap peers that fail while receiving this cleanup notice.
                    pass


class WorldManager:
    def __init__(self, empty_ttl: float = 300.0) -> None:
        self.worlds: dict[str, World] = {}
        self.empty_since: dict[str, float] = {}
        self.empty_ttl = empty_ttl

    def get(self, world_id: str) -> World:
        self.cleanup()
        if world_id not in self.worlds:
            seed = int.from_bytes(hashlib.sha256(world_id.encode()).digest()[:4], "big")
            self.worlds[world_id] = World(world_id, generate_world(seed))
        self.empty_since.pop(world_id, None)
        return self.worlds[world_id]

    def allocate_avatar_id(self, world: World) -> str:
        """Allocate identity on the server; client-supplied IDs are never trusted."""
        while True:
            avatar_id = uuid.uuid4().hex
            if avatar_id not in world.avatars:
                return avatar_id

    def mark_empty(self, world: World, now: float | None = None) -> None:
        if not world.sockets:
            self.empty_since.setdefault(world.id, time.monotonic() if now is None else now)

    def cleanup(self, now: float | None = None) -> None:
        now = time.monotonic() if now is None else now
        expired = [world_id for world_id, since in self.empty_since.items()
                   if now - since >= self.empty_ttl and not self.worlds[world_id].sockets]
        for world_id in expired:
            self.worlds.pop(world_id, None)
            self.empty_since.pop(world_id, None)


world_manager = WorldManager()
