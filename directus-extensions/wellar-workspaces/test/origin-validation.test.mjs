import assert from 'node:assert/strict';
import test from 'node:test';
import { validateMutationOrigin } from '../src/index.js';

test('allows safe methods without requiring an Origin header', () => {
  for (const method of ['GET', 'HEAD', 'OPTIONS']) {
    assert.equal(validateMutationOrigin(method, undefined, undefined), true);
  }
});

test('allows state changes only from the production browser origin', () => {
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    assert.equal(validateMutationOrigin(method, 'https://conntinuity.com', undefined), true);
    assert.equal(validateMutationOrigin(method, 'https://evil.example', undefined), false);
    assert.equal(validateMutationOrigin(method, 'null', undefined), false);
    assert.equal(validateMutationOrigin(method, undefined, undefined), false);
  }
});

test('allows origin-less Bearer-authenticated server calls but not foreign-origin calls', () => {
  assert.equal(validateMutationOrigin('POST', undefined, 'Bearer service-token'), true);
  assert.equal(validateMutationOrigin('PATCH', undefined, 'bearer service-token'), true);
  assert.equal(validateMutationOrigin('POST', 'https://evil.example', 'Bearer service-token'), false);
  assert.equal(validateMutationOrigin('POST', undefined, 'Basic credentials'), false);
});
