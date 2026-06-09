import type { Message } from "@jarvis/shared";

export interface ConversationRepository {
  getRecentMessages(sessionId: string): Promise<Message[]>;
  appendMessage(sessionId: string, message: Message): Promise<void>;
  clear(sessionId: string): Promise<void>;
}

export class InMemoryConversationRepository implements ConversationRepository {
  private readonly store = new Map<string, Message[]>();

  constructor(private readonly maxMessages: number) {}

  async getRecentMessages(sessionId: string): Promise<Message[]> {
    return [...(this.store.get(sessionId) ?? [])].slice(-this.maxMessages);
  }

  async appendMessage(sessionId: string, message: Message): Promise<void> {
    const messages = [...(this.store.get(sessionId) ?? []), message].slice(-this.maxMessages);
    this.store.set(sessionId, messages);
  }

  async clear(sessionId: string): Promise<void> {
    this.store.delete(sessionId);
  }
}
