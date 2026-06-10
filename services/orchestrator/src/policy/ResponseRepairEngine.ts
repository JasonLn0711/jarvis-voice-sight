import { FALLBACK_REPLIES, type EmotionResult, type Message } from "@jarvis/shared";

export type RepairReason =
  | "empty_reply"
  | "too_long"
  | "markdown"
  | "bullet"
  | "ai_self_reference"
  | "formal_wording"
  | "repetitive_ending"
  | "multi_sentence"
  | "generic_late_turn_fallback"
  | string;

export type RepairContext = {
  sessionId: string;
  userText: string;
  recentMessages: Message[];
  emotion?: EmotionResult;
};

export type RepairInput = {
  originalReply: string;
  reason: RepairReason;
  context: RepairContext;
};

export type RepairResult = {
  repaired: boolean;
  reply: string;
  source: "interview_template" | "emotion_template" | "text_rewrite" | "fallback";
};

const interviewTemplates = {
  closing: "用一句話收尾。",
  delivery: "這個成果很關鍵。",
  technical: "先講產品感。",
  latency: "先講延遲目標。",
  demo: "先講備援方案。",
  research: "研究重點很清楚。",
  intro: "自我介紹先求穩。",
  answer: "先抓一個重點。",
  concise: "這句再短一點。",
  product: "先講產品手感。",
  anxious: "先穩住，我在。",
  understood: "我懂你的意思。",
  enough: "這樣講可以。",
  continue: "你可以慢慢說。",
  smallest: "先抓最小版本。",
  close: "你已經接近了。",
  stable: "這裡先求穩。"
} as const;

const financialCoachTemplates = {
  insurance: "先建立信任感。",
  customerConcern: "先聽他的顧慮。",
  opening: "用關心開場。",
  risk: "先釐清他的目標。",
  product: "不要先談商品。",
  returnPromise: "避免承諾報酬。",
  compliance: "這裡要保守講。",
  pressure: "先尊重他的節奏。",
  complaint: "先接住情緒。",
  tone: "語氣再放慢。"
} as const;

export class ResponseRepairEngine {
  repair(input: RepairInput): RepairResult {
    const template = this.templateFor(input.context);
    if (template) {
      return {
        repaired: true,
        reply: template,
        source: "interview_template"
      };
    }

    const rewritten = this.rewriteText(input.originalReply, input.reason);
    if (rewritten) {
      return {
        repaired: true,
        reply: rewritten,
        source: "text_rewrite"
      };
    }

    if (input.context.emotion?.label === "anxious") {
      return {
        repaired: true,
        reply: interviewTemplates.anxious,
        source: "emotion_template"
      };
    }

    return {
      repaired: false,
      reply: FALLBACK_REPLIES.policyRejected,
      source: "fallback"
    };
  }

  private templateFor(context: RepairContext): string | undefined {
    const text = `${context.userText}\n${context.recentMessages.map((message) => message.content).join("\n")}`;
    if (/保險|保單|投保|保障|理賠/.test(context.userText)) {
      return financialCoachTemplates.insurance;
    }
    if (/排斥|抗拒|不想買|拒絕|顧慮|擔心/.test(context.userText)) {
      return financialCoachTemplates.customerConcern;
    }
    if (/開場|開口|第一句|怎麼說/.test(context.userText)) {
      return financialCoachTemplates.opening;
    }
    if (/風險|承受度|退休|資產|理財|配置/.test(context.userText)) {
      return financialCoachTemplates.risk;
    }
    if (/商品|產品|基金|保單|投資/.test(context.userText)) {
      return financialCoachTemplates.product;
    }
    if (/報酬|獲利|收益|賺/.test(context.userText)) {
      return financialCoachTemplates.returnPromise;
    }
    if (/合規|法遵|不能講|承諾/.test(context.userText)) {
      return financialCoachTemplates.compliance;
    }
    if (/成交|推銷|逼|催/.test(context.userText)) {
      return financialCoachTemplates.pressure;
    }
    if (/客訴|生氣|抱怨|不滿/.test(context.userText)) {
      return financialCoachTemplates.complaint;
    }
    if (/語氣|太硬|太急|壓迫/.test(context.userText)) {
      return financialCoachTemplates.tone;
    }
    if (/收尾|結尾|最後/.test(context.userText)) {
      return interviewTemplates.closing;
    }
    if (/交付|成果|deliver/i.test(context.userText)) {
      return interviewTemplates.delivery;
    }
    if (/太技術|技術/.test(context.userText)) {
      return interviewTemplates.technical;
    }
    if (/latency|延遲/i.test(context.userText)) {
      return interviewTemplates.latency;
    }
    if (/demo|展示|掛掉|故障/i.test(context.userText)) {
      return interviewTemplates.demo;
    }
    if (/研究/.test(context.userText)) {
      return interviewTemplates.research;
    }
    if (/自我介紹/.test(context.userText)) {
      return interviewTemplates.intro;
    }
    if (/回答|問/.test(context.userText)) {
      return interviewTemplates.answer;
    }
    if (/產品|產品人|PM/i.test(context.userText)) {
      return interviewTemplates.product;
    }
    if (/MVP|最小版本|範圍|scope/i.test(context.userText)) {
      return interviewTemplates.smallest;
    }
    if (/接近|快好了|差不多/.test(context.userText)) {
      return interviewTemplates.close;
    }
    if (/求穩|穩定|先穩/.test(context.userText)) {
      return interviewTemplates.stable;
    }
    if (context.recentMessages.length >= 12 && /保險|金融|理財|客戶|面試|產品|demo|latency|研究/i.test(text)) {
      return interviewTemplates.understood;
    }
    if (context.emotion?.label === "anxious") {
      return interviewTemplates.anxious;
    }
    return undefined;
  }

  private rewriteText(reply: string, reason: RepairReason): string | undefined {
    const compact = reply
      .replace(/[-*•#`_]/g, "")
      .replace(/我是.*?(AI|人工智慧|語言模型|模型)[。！？?]?/gi, "")
      .replace(/(請具體說明|您的|請問您|很抱歉|為您|協助您|根據您)/g, "")
      .trim();

    if (!compact) {
      return undefined;
    }

    if (reason === "multi_sentence") {
      const first = compact.split(/[。！？?]/).find((part) => part.trim());
      return first ? this.ensureSentence(first) : undefined;
    }

    if (
      reason === "return_promise" ||
      reason === "product_recommendation" ||
      reason === "authority_claim" ||
      reason === "pressure_sales"
    ) {
      return financialCoachTemplates.compliance;
    }

    if (reason === "repetitive_ending") {
      return financialCoachTemplates.customerConcern;
    }

    if (reason === "too_long" || reason === "formal_wording" || reason === "markdown" || reason === "bullet") {
      return interviewTemplates.concise;
    }

    return undefined;
  }

  private ensureSentence(text: string): string {
    const trimmed = text.trim();
    if (!trimmed) {
      return FALLBACK_REPLIES.policyRejected;
    }
    if (/[。！？?]$/.test(trimmed)) {
      return trimmed;
    }
    return `${trimmed}。`;
  }
}
