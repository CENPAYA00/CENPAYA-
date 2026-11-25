import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  bearerToken,
  corsHeaders,
  jsonResponse,
  originAllowed,
  readJsonObject,
} from '../.test-build/http-utils.js';

void describe('Worker HTTP security helpers', () => {
  void it('allows only requests with no Origin or the exact configured Origin', () => {
    assert.equal(originAllowed(new Request('https://worker.test/healthz'), undefined), true);
    assert.equal(originAllowed(new Request('https://worker.test/healthz', { headers: { Origin: 'https://app.test' } }), 'https://app.test'), true);
    assert.equal(originAllowed(new Request('https://worker.test/healthz', { headers: { Origin: 'https://evil.test' } }), 'https://app.test'), false);
    assert.equal(originAllowed(new Request('https://worker.test/healthz', { headers: { Origin: 'https://app.test.evil.test' } }), 'https://app.test'), false);
  });

  void it('emits an allow-origin header only for the exact configured origin', () => {
    const allowed = corsHeaders(new Request('https://worker.test/', { headers: { Origin: 'https://app.test' } }), 'https://app.test');
    const denied = corsHeaders(new Request('https://worker.test/', { headers: { Origin: 'https://evil.test' } }), 'https://app.test');
    assert.equal(allowed.get('access-control-allow-origin'), 'https://app.test');
    assert.equal(denied.has('access-control-allow-origin'), false);
  });

  void it('serializes JSON while preserving Headers instances', async () => {
    const headers = new Headers({ 'x-request-id': 'test-id' });
    const response = jsonResponse({ status: 'ok' }, 200, headers);
    assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
    assert.equal(response.headers.get('x-request-id'), 'test-id');
    assert.deepEqual(await response.json(), { status: 'ok' });
  });

  void it('accepts a single bearer token and rejects malformed authorization', () => {
    assert.equal(bearerToken(new Request('https://worker.test/', { headers: { Authorization: 'Bearer abc.def' } })), 'abc.def');
    assert.equal(bearerToken(new Request('https://worker.test/', { headers: { Authorization: 'Bearer abc extra' } })), null);
    assert.equal(bearerToken(new Request('https://worker.test/', { headers: { Authorization: 'Basic abc' } })), null);
  });

  void it('validates JSON object bodies and rejects invalid types and oversized payloads', async () => {
    const valid = new Request('https://worker.test/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ amount: 10 }),
    });
    assert.deepEqual(await readJsonObject(valid), { amount: 10 });

    const array = new Request('https://worker.test/', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '[]',
    });
    assert.equal(await readJsonObject(array), null);

    const text = new Request('https://worker.test/', {
      method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}',
    });
    assert.equal(await readJsonObject(text), null);

    const oversized = new Request('https://worker.test/', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ value: 'too long' }),
    });
    assert.equal(await readJsonObject(oversized, 4), null);
  });
});
