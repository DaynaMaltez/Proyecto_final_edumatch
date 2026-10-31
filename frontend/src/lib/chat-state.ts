import type { ChatMessage } from './api';

export function mergeChatMessages(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const messages = new Map(current.map((message) => [message._id, message]));
  for (const message of incoming) {
    const previous = messages.get(message._id);
    messages.set(message._id, { ...message, readAt: message.readAt ?? previous?.readAt ?? null });
  }
  return [...messages.values()].sort((a, b) => a._id.localeCompare(b._id));
}
