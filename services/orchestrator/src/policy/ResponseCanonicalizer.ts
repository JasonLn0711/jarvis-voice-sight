import type { EmotionResult, Message } from "@jarvis/shared";

export type CanonicalizeContext = {
  userText: string;
  recentMessages: Message[];
  emotion?: EmotionResult;
};

export type CanonicalizeResult = {
  changed: boolean;
  reply: string;
  reason?: string;
};

const canonicalReplies = {
  goal: "先抓住目標。",
  doNotPush: "先不要急著推。",
  lifestyle: "先聊他的生活。",
  familyResponsibility: "家庭責任是切入點。",
  caringTone: "用關心的語氣。",
  natural: "可以，這很自然。",
  customerConcern: "先聽他的顧慮。",
  trust: "先建立信任感。",
  trustFeeling: "這就是信任感。",
  opening: "用關心開場。",
  risk: "先釐清他的目標。",
  riskGap: "這比推產品好。",
  product: "不要先談商品。",
  returnPromise: "避免承諾報酬。",
  pressure: "先尊重他的節奏。",
  complaint: "先接住情緒。",
  tone: "語氣再放慢。",
  steadyOpen: "可以，先穩穩聊。"
} as const;

function compact(text: string): string {
  return text.trim().replace(/\s+/g, "");
}

export class ResponseCanonicalizer {
  canonicalize(reply: string, context: CanonicalizeContext): CanonicalizeResult {
    const normalizedReply = compact(reply);
    const userText = compact(context.userText);
    const combined = `${userText}${normalizedReply}`;

    const contextMapped = this.mapInsuranceVisitContext(userText);
    if (contextMapped && contextMapped !== normalizedReply) {
      return {
        changed: true,
        reply: contextMapped,
        reason: "insurance_visit_style_phrase"
      };
    }

    const mapped = this.mapFinanceInsuranceReply(normalizedReply, combined);
    if (mapped && mapped !== normalizedReply) {
      return {
        changed: true,
        reply: mapped,
        reason: "finance_insurance_cache_phrase"
      };
    }

    return {
      changed: false,
      reply: normalizedReply
    };
  }

  private mapInsuranceVisitContext(userText: string): string | undefined {
    if (/(拜訪|新客戶)/.test(userText)) {
      return canonicalReplies.goal;
    }
    if (/(保險).*(排斥|抗拒)/.test(userText)) {
      return canonicalReplies.doNotPush;
    }
    if (/(防備|戒心|一開口)/.test(userText)) {
      return canonicalReplies.lifestyle;
    }
    if (/(三十多歲|小孩|家庭責任)/.test(userText)) {
      return canonicalReplies.familyResponsibility;
    }
    if (/(像推銷|推銷感|業務感)/.test(userText)) {
      return canonicalReplies.caringTone;
    }
    if (/(家庭支出|支出壓力)/.test(userText)) {
      return canonicalReplies.natural;
    }
    if (/(現在不想買|不想買)/.test(userText)) {
      return canonicalReplies.pressure;
    }
    if (/(風險缺口|整理風險)/.test(userText)) {
      return canonicalReplies.riskGap;
    }
    if (/(顧問|不是業務)/.test(userText)) {
      return canonicalReplies.trustFeeling;
    }
    if (/(知道怎麼開場|怎麼開場了)/.test(userText)) {
      return canonicalReplies.steadyOpen;
    }
    return undefined;
  }

  private mapFinanceInsuranceReply(reply: string, combined: string): string | undefined {
    if (/(新客戶|拜訪).*(目標|準備|抓)/.test(combined)) {
      return canonicalReplies.goal;
    }
    if (/(保險|保單|投保|保障).*(排斥|抗拒|不想買|拒絕|不要急|不要推|先不要)/.test(combined)) {
      return canonicalReplies.doNotPush;
    }
    if (/(防備|戒心|一開口).*(生活|聊|先聊)/.test(combined)) {
      return canonicalReplies.lifestyle;
    }
    if (/(三十多歲|小孩|家庭|責任).*(切入|責任|家庭)/.test(combined)) {
      return canonicalReplies.familyResponsibility;
    }
    if (/(推銷|業務感).*(關心|語氣|自然)/.test(combined)) {
      return canonicalReplies.caringTone;
    }
    if (/(家庭支出|支出壓力|壓力).*(自然|可以|問)/.test(combined)) {
      return canonicalReplies.natural;
    }
    if (/(風險缺口|缺口).*(推產品|產品|好|整理)/.test(combined)) {
      return canonicalReplies.riskGap;
    }
    if (/(顧問|不是業務|信任感).*(信任|顧問)/.test(combined)) {
      return canonicalReplies.trustFeeling;
    }
    if (/(知道怎麼開場|怎麼開場|開場了).*(穩|聊|可以)/.test(combined)) {
      return canonicalReplies.steadyOpen;
    }
    if (/(報酬|獲利|收益|保證|風險).*(風險|不一定|不能保證|不保證|保守)/.test(combined)) {
      return canonicalReplies.returnPromise;
    }
    if (/(保險|保單|投保|保障).*(排斥|抗拒|不想買|拒絕|顧慮|慢慢|需求)/.test(combined)) {
      return canonicalReplies.customerConcern;
    }
    if (/(推銷|成交|逼|催|壓迫|太急).*(慢|尊重|自然|節奏|需求)/.test(combined)) {
      return canonicalReplies.pressure;
    }
    if (/(客訴|抱怨|不滿|服務不好|生氣).*(聽|理解|狀況|情緒)/.test(combined)) {
      return canonicalReplies.complaint;
    }
    if (/(語氣|太硬|太急).*(慢|放慢|柔和|緩)/.test(combined)) {
      return canonicalReplies.tone;
    }
    if (/(商品|產品|基金).*(不要|先不要|需求|目標)/.test(combined)) {
      return canonicalReplies.product;
    }
    if (/(開場|開口|第一句).*(關心|自然|生活)/.test(combined)) {
      return canonicalReplies.opening;
    }
    if (/(風險缺口|風險承受|理財|資產|退休).*(目標|釐清|擔憂|缺口)/.test(combined)) {
      return canonicalReplies.risk;
    }
    if (/(信任|關係).*(建立|先)/.test(combined)) {
      return canonicalReplies.trust;
    }
    return undefined;
  }
}
