const roleTagPattern = /^(assistant|jarvis|user|system)\s*[:：]/i;
const urlPattern = /https?:\/\/\S+|www\.\S+/gi;
const emojiPattern = /[\p{Extended_Pictographic}\p{Emoji_Presentation}]/gu;

const simplifiedToTraditional: Record<string, string> = {
  这: "這",
  里: "裡",
  会: "會",
  个: "個",
  说: "說",
  听: "聽",
  对: "對",
  担: "擔",
  应: "應",
  们: "們",
  让: "讓",
  买: "買",
  卖: "賣",
  风: "風",
  险: "險"
};

export class TtsTextFinalizer {
  constructor(private readonly maxChars: number) {}

  finalize(reply: string): string {
    let text = reply
      .replace(/```[\s\S]*?```/g, "")
      .replace(/["']?(reply|content|text|assistant)["']?\s*[:：]\s*/gi, "")
      .replace(/[{}\[\]"'\\]/g, "")
      .replace(urlPattern, "")
      .replace(emojiPattern, "")
      .replace(/[-*•#`_]/g, "")
      .trim();

    text = text
      .split(/\n+/)
      .map((line) => line.replace(roleTagPattern, "").trim())
      .filter(Boolean)
      .join("");

    for (const [source, target] of Object.entries(simplifiedToTraditional)) {
      text = text.replaceAll(source, target);
    }

    text = text
      .replace(/[，,；;：:]+/g, "，")
      .replace(/[!！]+/g, "。")
      .replace(/[?？]+/g, "？")
      .replace(/\*+/g, "")
      .replace(/\s+/g, "")
      .replace(/。{2,}/g, "。")
      .replace(/？{2,}/g, "？")
      .replace(/，。/g, "。")
      .replace(/，？/g, "？");

    const firstSentence = text.split(/(?<=[。！？?])/u).find((part) => part.trim()) ?? text;
    text = firstSentence.trim();

    if (Array.from(text).length > this.maxChars) {
      const firstClause = text.split(/[，,；;：:]/u).find((part) => part.trim());
      if (firstClause && Array.from(firstClause.trim()).length <= this.maxChars) {
        text = firstClause.trim();
      }
    }

    const chars = Array.from(text);
    if (chars.length > this.maxChars) {
      text = chars.slice(0, this.maxChars).join("").replace(/[，,；;：:]$/g, "");
    }

    if (text && !/[。！？?]$/.test(text)) {
      text = `${text}。`;
    }

    return text;
  }
}
