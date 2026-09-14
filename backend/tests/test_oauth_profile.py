import json
import unittest
from unittest.mock import patch

import httpx
from fastapi import HTTPException

from app import main


class OAuthProfileTests(unittest.IsolatedAsyncioTestCase):
    async def profile(self, payload):
        def respond(request):
            self.assertEqual(request.headers['X-OAuth-Token'], 'test-token')
            self.assertTrue(request.headers['X-Request-Timestamp'].isdigit())
            return httpx.Response(200, json=payload)

        client = httpx.AsyncClient(transport=httpx.MockTransport(respond))
        with patch.object(main.httpx, 'AsyncClient', return_value=client):
            return await main._oauth_profile('test-token')

    async def test_profile_response_variants(self):
        for payload in [
            {'id': 'user-1', 'name': '测试用户'},
            {'code': 20000, 'data': {'UserId': 'user-1'}},
            {'Code': 0, 'Data': json.dumps({'user': {'UrlToken': 'user-1'}})},
        ]:
            with self.subTest(payload=payload):
                self.assertEqual((await self.profile(payload))['id'], 'user-1')

    async def test_business_failure_is_not_a_parse_error(self):
        with self.assertRaises(HTTPException) as raised:
            await self.profile({'code': 20001, 'data': {'message': 'private-value'}})
        self.assertEqual(raised.exception.detail['failedStage'], 'profile_response')
        self.assertEqual(raised.exception.detail['upstreamCode'], 20001)
        self.assertNotIn('private-value', str(raised.exception.detail))

    async def test_unknown_profile_reports_shape_without_values(self):
        with self.assertRaises(HTTPException) as raised:
            await self.profile({'code': 20000, 'data': {'unknown': 'private-value', 'access_token': 'secret-value'}})
        detail = raised.exception.detail
        self.assertEqual(detail['dataFields'], {'unknown': 'str', 'access_token': 'str'})
        self.assertEqual(detail['upstreamCode'], 20000)
        self.assertNotIn('private-value', str(detail))
        self.assertNotIn('secret-value', str(detail))

    async def test_token_exchange_accepts_template_envelopes(self):
        for payload in [
            {'access_token': 'token', 'expires_in': 3600},
            {'code': 20000, 'data': {'access_token': 'token', 'expires_in': 3600}},
            {'Code': 0, 'Data': {'access_token': 'token', 'expires_in': 3600}},
        ]:
            client = httpx.AsyncClient(transport=httpx.MockTransport(lambda request: httpx.Response(200, json=payload)))
            with patch.object(main, '_oauth_ready'), patch.object(main.httpx, 'AsyncClient', return_value=client):
                self.assertEqual((await main._oauth_exchange('code'))['access_token'], 'token')
