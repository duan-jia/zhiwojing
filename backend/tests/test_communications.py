import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

import httpx
from sqlmodel import Session, create_engine, select
from app import main
from app.memory.store import Contact, Message


class CommunicationTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.original = main.engine
        main.engine = create_engine(f"sqlite:///{Path(self.tmp.name) / 'db.sqlite'}", connect_args={"check_same_thread": False})
        main.startup(); main.communication_store.ensure_contacts(1, 2)
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=main.app), base_url="http://test")
    async def asyncTearDown(self):
        await self.client.aclose(); main.engine.dispose(); main.engine = self.original; main.communication_store.engine = self.original; self.tmp.cleanup()

    async def send(self, sender=1, recipient=2, content="你好"):
        return await self.client.post('/api/messages/send', json={"sender_id": sender, "recipient_id": recipient, "content": content})

    async def test_contacts_idempotent_and_removed_is_respected(self):
        main.communication_store.ensure_contacts(1, 2)
        with Session(main.engine) as session:
            self.assertEqual(len(session.exec(select(Contact)).all()), 2)
        await self.client.delete('/api/contacts/2?user_id=1')
        main.communication_store.ensure_contacts(1, 2)
        contacts = (await self.client.get('/api/contacts?user_id=1')).json()['contacts']
        self.assertEqual(contacts[0]['status'], 'removed')
        await self.client.post('/api/contacts/2/restore?user_id=1')
        self.assertEqual((await self.client.get('/api/contacts?user_id=1')).json()['contacts'][0]['status'], 'active')

    async def test_online_human_does_not_auto_reply(self):
        await self.client.post('/api/presence', json={"user_id": 2, "online": True, "human_controlled": True})
        runtime = AsyncMock()
        with patch.object(main, 'agent_runtime', runtime): result = await self.send()
        self.assertEqual(result.json()['delivered'], 'human'); runtime.chat.assert_not_called()

    async def test_offline_agent_reply_cap_read_and_human_reset(self):
        runtime = AsyncMock(); runtime.chat.return_value = '你好呀'
        with patch.object(main, 'agent_runtime', runtime), patch.dict(os.environ, {"REMOTE_AGENT_REPLY_LIMIT": "1"}):
            first = await self.send(); capped = await self.send(content='还在吗')
        self.assertEqual(first.json()['delivered'], 'agent'); self.assertTrue(capped.json()['capped'])
        self.assertEqual((await self.client.get('/api/messages/inbox?user_id=1')).json()['unread'], 1)
        await self.client.get('/api/messages/thread/2?user_id=1')
        self.assertEqual((await self.client.get('/api/messages/inbox?user_id=1')).json()['unread'], 0)
        await self.client.post('/api/presence', json={"user_id": 1, "online": True, "human_controlled": True})
        await self.send(sender=2, recipient=1, content='本人回复')
        with Session(main.engine) as session:
            row = session.exec(select(Contact).where(Contact.user_id == 1, Contact.contact_id == 2)).first()
            self.assertEqual(row.agent_reply_streak, 0)
