import { z } from "zod";
import { EMOTION_LABELS } from "../types/voice.js";

export const voiceTurnRequestSchema = z.object({
  session_id: z.string().min(1),
  audio_format: z.enum(["wav", "mp3", "webm", "mock"]),
  audio_base64: z.string().min(1),
  client_timestamp: z.string().datetime({ offset: true }).or(z.string().min(1))
});

export const messageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
  timestamp: z.string()
});

export const emotionResultSchema = z.object({
  label: z.enum(EMOTION_LABELS),
  confidence: z.number().min(0).max(1),
  signals: z.array(z.string()),
  durationMs: z.number().nonnegative().optional()
});

export const latencyReportSchema = z.object({
  vad_ms: z.number().nonnegative(),
  asr_ms: z.number().nonnegative(),
  emotion_ms: z.number().nonnegative(),
  llm_ms: z.number().nonnegative(),
  policy_ms: z.number().nonnegative(),
  tts_ms: z.number().nonnegative(),
  total_ms: z.number().nonnegative()
});

export const voiceTurnResponseSchema = z.object({
  session_id: z.string(),
  turn_id: z.string(),
  transcript: z.string(),
  reply: z.string(),
  emotion: emotionResultSchema.optional(),
  audio_url: z.string().optional(),
  latency: latencyReportSchema,
  status: z.enum(["ok", "partial", "error"])
});

export const asrRequestSchema = z.object({
  audio_format: z.enum(["wav", "mp3", "webm", "mock"]),
  audio_base64: z.string().min(1)
});

export const asrResultSchema = z.object({
  text: z.string(),
  language: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  durationMs: z.number().nonnegative(),
  segments: z
    .array(
      z.object({
        startMs: z.number().nonnegative(),
        endMs: z.number().nonnegative(),
        text: z.string()
      })
    )
    .optional()
});

export const chatRequestSchema = z.object({
  text: z.string(),
  session_id: z.string().optional()
});

export const chatResultSchema = z.object({
  reply: z.string(),
  tokensUsed: z.number().nonnegative().optional(),
  durationMs: z.number().nonnegative(),
  finishReason: z.string().optional()
});

export const ttsRequestSchema = z.object({
  text: z.string(),
  voiceId: z.string().optional(),
  speed: z.number().positive().optional(),
  pitch: z.number().optional(),
  emotionStyle: z.string().optional()
});

export const ttsResultSchema = z.object({
  audioUrl: z.string().optional(),
  audioBase64: z.string().optional(),
  durationMs: z.number().nonnegative(),
  format: z.enum(["wav", "mp3"])
});

export const emotionRequestSchema = z.object({
  text: z.string(),
  recentMessages: z.array(messageSchema).optional()
});

export type VoiceTurnRequest = z.infer<typeof voiceTurnRequestSchema>;
export type ASRRequest = z.infer<typeof asrRequestSchema>;
export type ASRResult = z.infer<typeof asrResultSchema>;
export type ChatRequest = z.infer<typeof chatRequestSchema>;
export type ChatResult = z.infer<typeof chatResultSchema>;
export type TTSRequest = z.infer<typeof ttsRequestSchema>;
export type TTSResult = z.infer<typeof ttsResultSchema>;
export type EmotionRequest = z.infer<typeof emotionRequestSchema>;
