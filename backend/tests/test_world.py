import asyncio
import unittest

from app.world import Avatar, MAP_HEIGHT, MAP_WIDTH, PLAYER_SPEED, SPAWN, World, WorldManager, generate_world


class WorldTests(unittest.TestCase):
    def test_generated_map_has_expected_shape_and_safe_spawn(self):
        world_map = generate_world(42)
        self.assertEqual((world_map["width"], world_map["height"]), (MAP_WIDTH, MAP_HEIGHT))
        self.assertEqual(len(world_map["cells"]), MAP_HEIGHT)
        self.assertTrue(all(len(row) == MAP_WIDTH for row in world_map["cells"]))
        spawn_cell = world_map["cells"][int(SPAWN[1])][int(SPAWN[0])]
        self.assertNotEqual(spawn_cell["ground"], "water")
        self.assertIsNone(spawn_cell["object"])

    def test_movement_is_bounded_and_normalized(self):
        world = World("test", generate_world(7))
        world.avatars["a"] = Avatar("a", "A", *SPAWN)
        avatar = world.move("a", 100, 0, world.avatars["a"].last_move_at + 0.1)
        self.assertAlmostEqual(avatar.x, SPAWN[0] + 0.35)
        self.assertEqual(avatar.y, SPAWN[1])
        for _ in range(200):
            world.move("a", -1, 0, avatar.last_move_at + 0.1)
        self.assertGreaterEqual(avatar.x, 0)

    def test_seed_is_deterministic(self):
        self.assertEqual(generate_world(123), generate_world(123))

    def test_broadcast_removes_disconnected_avatar(self):
        class Socket:
            def __init__(self, fails=False):
                self.fails = fails
                self.messages = []

            async def send_json(self, message):
                if self.fails:
                    raise RuntimeError("closed")
                self.messages.append(message)

        world = World("test", generate_world(9))
        world.avatars["ok"] = Avatar("ok", "OK", *SPAWN)
        world.avatars["gone"] = Avatar("gone", "Gone", *SPAWN)
        ok, gone = Socket(), Socket(fails=True)
        world.sockets.update({"ok": ok, "gone": gone})
        asyncio.run(world.broadcast({"type": "ping"}))
        self.assertEqual(ok.messages[0], {"type": "ping"})
        self.assertNotIn("gone", world.sockets)
        self.assertNotIn("gone", world.avatars)
        self.assertEqual(ok.messages[-1], {"type": "leave", "avatarId": "gone"})

    def test_movement_uses_server_clock_and_caps_each_step(self):
        world = World("test", generate_world(7))
        avatar = Avatar("a", "A", *SPAWN)
        world.avatars["a"] = avatar
        start = avatar.last_move_at
        world.move("a", 1, 0, start + 0.05)
        first = avatar.x
        world.move("a", 1, 0, start + 1000)  # a stalled client cannot teleport
        self.assertAlmostEqual(first, SPAWN[0] + PLAYER_SPEED * 0.05)
        self.assertLessEqual(avatar.x, first + PLAYER_SPEED * 0.1)

    def test_server_ids_are_unique_and_empty_worlds_expire(self):
        manager = WorldManager(empty_ttl=5)
        world = manager.get("room")
        ids = {manager.allocate_avatar_id(world) for _ in range(100)}
        self.assertEqual(len(ids), 100)
        manager.mark_empty(world, now=10)
        manager.cleanup(now=16)
        self.assertNotIn("room", manager.worlds)


if __name__ == "__main__":
    unittest.main()
