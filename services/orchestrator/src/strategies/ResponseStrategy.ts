import type { EmotionResult, Message, PersonaConfig } from "@jarvis/shared";

export type StrategyInput = {
  userText: string;
  recentMessages: Message[];
  persona: PersonaConfig;
  emotion?: EmotionResult;
};

export interface ResponseStrategy {
  readonly name: string;
  buildPrompt(input: StrategyInput): string;
}

function formatMessages(messages: Message[]): string {
  if (messages.length === 0) {
    return "(none)";
  }
  return messages.map((message) => `${message.role}: ${message.content}`).join("\n");
}

export class ConciseJarvisStrategy implements ResponseStrategy {
  readonly name = "concise_jarvis";

  buildPrompt(input: StrategyInput): string {
    return `System:
You are Jarvis.
You are calm, intelligent, concise, and supportive.
Always reply in Traditional Chinese.
Reply in 10 to 20 Chinese characters.
Never explain.
Never use bullet points.
Never mention that you are an AI model.
Your goal is to keep the user talking.

Recent conversation:
${formatMessages(input.recentMessages)}

User:
${input.userText}

Assistant:`;
  }
}

const emotionRules: Record<string, string> = {
  anxious: "slow down, ask one concrete question",
  tired: "reduce cognitive load",
  confused: "clarify",
  excited: "lightly match energy",
  sad: "acknowledge gently",
  angry: "de-escalate",
  uncertain: "help choose next step",
  neutral: "continue naturally"
};

export class EmotionAwareJarvisStrategy implements ResponseStrategy {
  readonly name = "emotion_aware_jarvis";

  buildPrompt(input: StrategyInput): string {
    const emotion = input.emotion ?? {
      label: "neutral",
      confidence: 0,
      signals: []
    };
    const rule = emotionRules[emotion.label] ?? emotionRules.neutral;

    return `System:
You are Jarvis.
You are calm, intelligent, concise, and supportive.
Always reply in Traditional Chinese.
Reply in 10 to 20 Chinese characters.
Never explain.
Never use bullet points.
Never mention that you are an AI model.
Your goal is to keep the user talking.

User emotional state:
${emotion.label}
Confidence:
${emotion.confidence}

Response rule:
${rule}

Recent conversation:
${formatMessages(input.recentMessages)}

User:
${input.userText}

Assistant:`;
  }
}
