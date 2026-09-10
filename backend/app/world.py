"""Server-authoritative state for the shared isometric world."""

from __future__ import annotations

import asyncio
import hashlib
import math
import random
from dataclasses import dataclass, field
from typing import Any

from fastapi import WebSocket

MAP_WIDTH = 28
MAP_HEIGHT = 28
SPAWN = (MAP_WIDTH // 2 + 0.5, MAP_HEIGHT // 2 + 0.5)
PLAYER_RADIUS = 0.22
PLAYER_SPEED = 3.5  # grid cells per second


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

    def move(self, avatar_id: str, dx: float, dy: float, elapsed: float) -> Avatar:
        avatar = self.avatars[avatar_id]
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


class WorldManager:
    def __init__(self) -> None:
        self.worlds: dict[str, World] = {}

    def get(self, world_id: str) -> World:
        if world_id not in self.worlds:
            seed = int.from_bytes(hashlib.sha256(world_id.encode()).digest()[:4], "big")
            self.worlds[world_id] = World(world_id, generate_world(seed))
        return self.worlds[world_id]


world_manager = WorldManager()
