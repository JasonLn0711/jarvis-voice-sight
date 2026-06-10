import { FALLBACK_REPLIES, type EmotionResult, type Message } from "@jarvis/shared";

export type ConversationContext = {
  sessionId: string;
  emotion?: EmotionResult;
  userText?: string;
  recentMessages?: Message[];
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

  validate(reply: string, context: ConversationContext = { sessionId: "unknown" }): PolicyResult {
    const normalized = this.normalize(reply);
    const reason = this.findViolation(normalized, context);

    if (reason) {
      return {
        accepted: false,
        finalReply: normalized,
        reason
      };
    }

    return {
      accepted: true,
      finalReply: normalized
    };
  }

  normalize(reply: string): string {
    let normalized = reply.trim().replace(/\s+/g, "");
    for (const [source, target] of Object.entries(simplifiedToTraditional)) {
      normalized = normalized.replaceAll(source, target);
    }
    return normalized;
  }

  private findViolation(reply: string, context: ConversationContext): string | undefined {
    if (!reply) {
      return "empty_reply";
    }
    if (this.isLateTurn(context) && reply === FALLBACK_REPLIES.policyRejected) {
      return "generic_late_turn_fallback";
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
    if (/(請具體說明|您的|請問您|很抱歉|為您|協助您|根據您)/.test(reply)) {
      return "formal_wording";
    }
    if (/就好[。！？?]?$/.test(reply)) {
      return "repetitive_ending";
    }
    if (reply === "避免承諾報酬。") {
      return undefined;
    }
    if (/(保證獲利|保證賺|穩賺|一定賺|無風險|承諾報酬|保證報酬)/.test(reply)) {
      return "return_promise";
    }
    if (/(直接買|一定要買|立刻投保|馬上投資|推薦你買|最適合你買)/.test(reply)) {
      return "product_recommendation";
    }
    if (/(醫療診斷|法律意見|投資建議|核保結論|保證理賠)/.test(reply)) {
      return "authority_claim";
    }
    if (/(逼他|催他|讓他成交|不要給他拒絕)/.test(reply)) {
      return "pressure_sales";
    }
    if ((reply.match(/[？?]/g) ?? []).length > 1 || /[。！？?].+[。！？?]/.test(reply)) {
      return "multi_sentence";
    }
    return undefined;
  }

  private isLateTurn(context: ConversationContext): boolean {
    return (context.recentMessages?.length ?? 0) >= 12;
  }
}
