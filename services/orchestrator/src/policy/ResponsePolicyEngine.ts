import { FALLBACK_REPLIES, type EmotionResult } from "@jarvis/shared";

export type ConversationContext = {
  sessionId: string;
  emotion?: EmotionResult;
};

export type PolicyResult = {
  accepted: boolean;
  finalReply: string;
  reason?: string;
};

const simplifiedToTraditional: Record<string, string> = {
  你其实: "你其實",
  准备: "準備",
  担心: "擔心",
  发生: "發生",
  什么: "什麼",
  这里: "這裡",
  说: "說",
  听: "聽",
  问题: "問題",
  练: "練"
};

export class ResponsePolicyEngine {
  constructor(private readonly maxChars: number) {}

  validate(reply: string, _context: ConversationContext): PolicyResult {
    const normalized = this.normalize(reply);
    const reason = this.findViolation(normalized);

    if (reason) {
      return {
        accepted: false,
        finalReply: FALLBACK_REPLIES.policyRejected,
        reason
      };
    }

    return {
      accepted: true,
      finalReply: normalized
    };
  }

  private normalize(reply: string): string {
    let normalized = reply.trim().replace(/\s+/g, "");
    for (const [source, target] of Object.entries(simplifiedToTraditional)) {
      normalized = normalized.replaceAll(source, target);
    }
    return normalized;
  }

  private findViolation(reply: string): string | undefined {
    if (!reply) {
      return "empty_reply";
    }
    if (Array.from(reply).length > this.maxChars) {
      return "too_long";
    }
    if (/```|#{1,6}\s|\*\*|__/.test(reply)) {
      return "markdown";
    }
    if (/^[-*•]\s?/.test(reply)) {
      return "bullet";
    }
    if (/我是.*(AI|人工智慧|語言模型|模型)/i.test(reply)) {
      return "ai_self_reference";
    }
    return undefined;
  }
}
