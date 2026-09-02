import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSingleRange, resolveProtectedFileDelivery } from '../src/index.js';

test('parses supported single byte ranges', () => {
  assert.deepEqual(parseSingleRange(undefined), undefined);
  assert.deepEqual(parseSingleRange('bytes=0-499'), { start: 0, end: 499 });
  assert.deepEqual(parseSingleRange('bytes=500-'), { start: 500, end: undefined });
  assert.deepEqual(parseSingleRange('bytes=-500'), { start: undefined, end: 500 });
  assert.equal(parseSingleRange('bytes=0-0'), null);
  assert.equal(parseSingleRange('bytes=500-500'), null);
});

test('rejects malformed and multi-range headers', () => {
  assert.equal(parseSingleRange('bytes=0-1,5-10'), null);
  assert.equal(parseSingleRange('bytes='), null);
  assert.equal(parseSingleRange('items=0-1'), null);
});

test('resolves mixed authorized kinds by MIME compatibility', () => {
  assert.deepEqual(resolveProtectedFileDelivery(['avatar'], 'image/png'), { allowed: true, contentType: 'image/png', attachment: false });
  assert.equal(resolveProtectedFileDelivery(['avatar'], 'image/svg+xml').allowed, false);
  assert.deepEqual(resolveProtectedFileDelivery(['scan-video'], 'video/mp4'), { allowed: true, contentType: 'video/mp4', attachment: false });
  assert.deepEqual(resolveProtectedFileDelivery(['scan-audio'], 'audio/mpeg'), { allowed: true, contentType: 'audio/mpeg', attachment: false });
  assert.deepEqual(resolveProtectedFileDelivery(['report'], 'application/pdf'), { allowed: true, contentType: 'application/octet-stream', attachment: true });
  assert.deepEqual(resolveProtectedFileDelivery(['report', 'avatar'], 'image/png'), { allowed: true, contentType: 'image/png', attachment: false });
  assert.equal(resolveProtectedFileDelivery(['scan-image'], 'video/mp4').allowed, false);
  assert.deepEqual(resolveProtectedFileDelivery(['report'], 'text/html'), { allowed: true, contentType: 'application/octet-stream', attachment: true });
});
