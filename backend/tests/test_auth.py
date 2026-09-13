import hashlib
import os
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

import httpx
from sqlmodel import Session, create_engine, select

from app import main
from app.memory.store import Contact, Message, PersonaCard


class AuthTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.original_engine = main.engine
        main.engine = create_engine(f"sqlite:///{Path(self.directory.name) / 'test.db'}", connect_args={"check_same_thread": False})
        main.startup()
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=main.app), base_url="http://test")
        self.env = patch.dict(os.environ, {"AUTH_REQUIRED": "1", "AUTH_DEV_MODE": "1"})
        self.env.start()

    async def asyncTearDown(self):
        self.env.stop()
        await self.client.aclose()
        main.engine.dispose()
        main.engine = self.original_engine
        self.directory.cleanup()

    async def guest(self):
        response = await self.client.post("/api/auth/guest")
        self.assertEqual(response.status_code, 200)
        return response.json()

    @staticmethod
    def headers(token):
        return {"Authorization": f"Bearer {token}"}

    async def test_guest_hash_me_and_logout(self):
        guest = await self.guest()
        self.assertEqual(guest["user"]["kind"], "guest")
        with Session(main.engine) as session:
            row = session.exec(select(main.AuthSession).where(main.AuthSession.user_id == guest["user"]["id"])).one()
            self.assertEqual(row.token_hash, hashlib.sha256(guest["token"].encode()).hexdigest())
            self.assertNotEqual(row.token_hash, guest["token"])
        me = await self.client.get("/api/me?user_id=1", headers=self.headers(guest["token"]))
        self.assertEqual(me.json()["id"], guest["user"]["id"])
        self.assertEqual((await self.client.post("/api/auth/logout", headers=self.headers(guest["token"]))).status_code, 200)
        denied = await self.client.get("/api/me", headers=self.headers(guest["token"]))
        self.assertEqual(denied.status_code, 401)
        self.assertEqual(denied.json()["detail"]["code"], "INVALID_TOKEN")

    async def test_required_switch_and_expiry(self):
        self.assertEqual((await self.client.get("/api/contacts")).status_code, 401)
        self.assertEqual((await self.client.get("/api/health")).status_code, 200)
        with patch.dict(os.environ, {"AUTH_REQUIRED": "0"}):
            self.assertEqual((await self.client.get("/api/contacts")).status_code, 200)
        guest = await self.guest()
        with Session(main.engine) as session:
            row = session.exec(select(main.AuthSession).where(main.AuthSession.user_id == guest["user"]["id"])).one()
            row.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
            session.add(row)
            session.commit()
        self.assertEqual((await self.client.get("/api/me", headers=self.headers(guest["token"]))).status_code, 401)

    async def test_dev_login_is_gated(self):
        response = await self.client.post("/api/auth/dev-login", json={"user_id": 1})
        self.assertEqual(response.status_code, 200)
        with patch.dict(os.environ, {"AUTH_DEV_MODE": "0"}):
            self.assertEqual((await self.client.post("/api/auth/dev-login", json={"user_id": 1})).status_code, 404)

    async def test_tokens_cannot_spoof_owned_data(self):
        first, second = await self.guest(), await self.guest()
        a, b = first["user"]["id"], second["user"]["id"]
        with Session(main.engine) as session:
            session.add(Contact(user_id=b, contact_id=1))
            session.add(Message(pair_key=main._pair_key(b, 1), sender_id=1, recipient_id=b, content="private"))
            session.add(PersonaCard(avatar_id=b, persona_json='{"summary":"private"}'))
            session.commit()
        headers = self.headers(first["token"])
        contacts = await self.client.get(f"/api/contacts?user_id={b}", headers=headers)
        inbox = await self.client.get(f"/api/messages/inbox?user_id={b}", headers=headers)
        persona = await self.client.get(f"/api/persona?user_id={b}", headers=headers)
        self.assertEqual(contacts.json(), {"contacts": [], "unread": 0})
        self.assertEqual(inbox.json(), {"unread": 0})
        self.assertEqual(persona.status_code, 404)
        presence = await self.client.post("/api/presence", headers=headers, json={"user_id": b, "online": True, "human_controlled": True})
        self.assertEqual(presence.status_code, 200)
        with Session(main.engine) as session:
            self.assertIsNone(session.get(main.Presence, b))
            self.assertTrue(session.get(main.Presence, a).online)
