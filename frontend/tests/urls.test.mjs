import assert from 'node:assert/strict';
import test from 'node:test';
import { socketOrigin } from '../src/lib/urls.ts';
test('production chat with a relative API connects to the current website', () => {
  assert.equal(socketOrigin('/api', false), undefined);
  assert.equal(socketOrigin('/api/', false), undefined);
});
test('a separate backend uses its origin; development always uses the Vite proxy', () => {
  assert.equal(socketOrigin('https://api.example.com/api/', false), 'https://api.example.com');
  assert.equal(socketOrigin('http://localhost:4000/api', true), undefined);
});
