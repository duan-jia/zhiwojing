import os, tempfile, unittest
from pathlib import Path
from unittest.mock import patch
import httpx
from sqlmodel import Session, create_engine, select
from app import main

ENV={"AUTH_REQUIRED":"0","ZHIHU_OAUTH_APP_ID":"123","ZHIHU_OAUTH_APP_KEY":"key","ZHIHU_OAUTH_REDIRECT_URI":"https://example.com/auth/callback","FRONTEND_URL":"https://app.example.com"}
class OAuthTests(unittest.IsolatedAsyncioTestCase):
 async def asyncSetUp(self):
  self.tmp=tempfile.TemporaryDirectory(); self.old=main.engine
  main.engine=create_engine(f"sqlite:///{Path(self.tmp.name)/'db'}",connect_args={"check_same_thread":False}); main.startup()
  self.client=httpx.AsyncClient(transport=httpx.ASGITransport(app=main.app),base_url="http://test",follow_redirects=False)
  self.env=patch.dict(os.environ,ENV,clear=False); self.env.start()
 async def asyncTearDown(self):
  self.env.stop(); await self.client.aclose(); main.engine.dispose(); main.engine=self.old; self.tmp.cleanup()
 async def start(self,headers=None):
  r=await self.client.get('/api/oauth/start',headers=headers or {}); self.assertEqual(r.status_code,302)
  return httpx.URL(r.headers['location']).params['state']
 async def test_state_missing_expiry_and_replay(self):
  self.assertEqual((await self.client.get('/auth/callback?authorization_code=x')).json()['detail']['code'],'OAUTH_STATE_MISSING')
  state=await self.start()
  with Session(main.engine) as db:
   row=db.exec(select(main.OAuthState)).one(); row.expires_at=main.datetime.now(main.timezone.utc)-main.timedelta(seconds=1); db.add(row); db.commit()
  self.assertEqual((await self.client.get(f'/auth/callback?authorization_code=x&state={state}')).json()['detail']['code'],'OAUTH_STATE_EXPIRED')
 async def test_guest_upgrade_ticket_exchange_and_logout(self):
  guest=(await self.client.post('/api/auth/guest')).json(); state=await self.start({'Authorization':f"Bearer {guest['token']}"})
  def handler(request):
   self.assertEqual(request.url, httpx.URL('https://openapi.zhihu.com/access_token'))
   self.assertIn(b'grant_type=authorization_code',request.content)
   return httpx.Response(200,json={'access_token':'personal-secret','token_type':'Bearer','expires_in':3600})
  transport=httpx.MockTransport(handler)
  real=main.httpx.AsyncClient
  class Client:
   def __init__(self,*a,**kw): self.inner=real(transport=transport)
   async def __aenter__(self): return await self.inner.__aenter__()
   async def __aexit__(self,*a): return await self.inner.__aexit__(*a)
  with patch.object(main.httpx,'AsyncClient',Client):
   cb=await self.client.get(f'/auth/callback?authorization_code=abc&state={state}')
  self.assertEqual(cb.status_code,302); ticket=httpx.URL(cb.headers['location']).params['ticket']
  exchanged=await self.client.post('/api/auth/exchange',json={'ticket':ticket}); self.assertEqual(exchanged.status_code,200)
  self.assertEqual(exchanged.json()['user']['id'],guest['user']['id']); self.assertEqual(exchanged.json()['user']['kind'],'zhihu')
  self.assertEqual((await self.client.post('/api/auth/exchange',json={'ticket':ticket})).json()['detail']['code'],'OAUTH_TICKET_INVALID')
  token=exchanged.json()['token']; status=await self.client.get('/api/oauth/status',headers={'Authorization':f'Bearer {token}'}); self.assertTrue(status.json()['authorized'])
  self.assertEqual((await self.client.post('/api/oauth/logout',headers={'Authorization':f'Bearer {token}'})).status_code,200)
  self.assertFalse((await self.client.get('/api/oauth/status',headers={'Authorization':f'Bearer {token}'})).json()['authorized'])
