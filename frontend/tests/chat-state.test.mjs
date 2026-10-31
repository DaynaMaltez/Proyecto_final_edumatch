import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeChatMessages } from '../src/lib/chat-state.ts';

const message = { _id: '001', conversationId: 'chat', senderId: 'student', text: 'Hola', createdAt: '2026-10-30T10:00:00Z', readAt: null, clientId: 'request1' };
test('a late send response cannot undo a read receipt', () => {
  const result = mergeChatMessages([{ ...message, readAt: '2026-10-30T10:01:00Z' }], [message]);
  assert.equal(result[0].readAt, '2026-10-30T10:01:00Z');
});
test('socket retries do not duplicate messages and history stays ordered', () => {
  const result = mergeChatMessages([{ ...message, _id: '002' }], [message, message]);
  assert.deepEqual(result.map((item) => item._id), ['001', '002']);
});
