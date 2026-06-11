import { z } from "zod";

const providerSchema = z.enum([
  "mock",
  "http",
  "breeze_asr",
  "breeze_asr_25",
  "ollama",
  "vllm",
  "gemma_4_e2b",
  "gemma_4_e4b",
  "breezyvoice"
]);

const envSchema = z.object({
  APP_ENV: z.string().default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  ASR_PROVIDER: providerSchema.default("mock"),
  ASR_SERVICE_URL: z.string().url().default("http://localhost:8001"),
  LLM_PROVIDER: providerSchema.default("mock"),
  LLM_SERVICE_URL: z.string().url().default("http://localhost:8002"),
  OLLAMA_BASE_URL: z.string().url().default("http://localhost:11434"),
  OLLAMA_MODEL: z.string().default("gemma4:e2b"),
  VLLM_BASE_URL: z.string().url().default("http://localhost:8000/v1"),
  VLLM_MODEL: z.string().default("google/gemma-4-E2B-it"),
  TTS_PROVIDER: providerSchema.default("mock"),
  TTS_SERVICE_URL: z.string().url().default("http://localhost:8003"),
  ENABLE_EMOTION: z
    .string()
    .default("true")
    .transform((value) => value === "true"),
  EMOTION_PROVIDER: providerSchema.default("mock"),
  EMOTION_SERVICE_URL: z.string().url().default("http://localhost:8004"),
  CONVERSATION_STORE: z.enum(["memory"]).default("memory"),
  MAX_RECENT_MESSAGES: z.coerce.number().int().positive().default(6),
  REPLY_MAX_CHARS: z.coerce.number().int().positive().default(18),
  TOTAL_TIMEOUT_MS: z.coerce.number().int().positive().default(3000),
  BODY_LIMIT_BYTES: z.coerce.number().int().positive().default(25 * 1024 * 1024),
  ASR_TIMEOUT_MS: z.coerce.number().int().positive().default(1000),
  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(800),
  TTS_TIMEOUT_MS: z.coerce.number().int().positive().default(1200),
  EMOTION_TIMEOUT_MS: z.coerce.number().int().positive().default(300),
  ENABLE_PLAYBACK_DELAY: z
    .string()
    .default("true")
    .transform((value) => value === "true"),
  PLAYBACK_DELAY_MIN_MS: z.coerce.number().int().nonnegative().default(1000),
  PLAYBACK_DELAY_MAX_MS: z.coerce.number().int().nonnegative().default(2000),
  TTS_LONG_FORM_ENABLED: z
    .string()
    .default("false")
    .transform((value) => value === "true"),
  TTS_MAX_PARALLEL_CHUNKS: z.coerce.number().int().positive().default(3),
  TTS_TARGET_CHUNK_SECONDS: z.coerce.number().positive().default(4),
  TTS_SENTENCE_SILENCE_MS: z.coerce.number().int().min(120).max(220).default(160),
  MAX_PARALLEL_TTS_WORKERS: z.coerce.number().int().positive().default(3),
  CHUNK_TARGET_SECONDS: z.coerce.number().positive().default(4),
  SILENCE_PADDING_MS: z.coerce.number().int().min(120).max(220).default(120),
  TTS_MODEL_VERSION: z.string().default("breezyvoice-default")
});

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(overrides: Partial<NodeJS.ProcessEnv> = {}): AppConfig {
  const raw = { ...process.env, ...overrides };
  raw.TTS_MAX_PARALLEL_CHUNKS ??= raw.MAX_PARALLEL_TTS_WORKERS;
  raw.TTS_TARGET_CHUNK_SECONDS ??= raw.CHUNK_TARGET_SECONDS;
  raw.TTS_SENTENCE_SILENCE_MS ??= raw.SILENCE_PADDING_MS;
  raw.MAX_PARALLEL_TTS_WORKERS ??= raw.TTS_MAX_PARALLEL_CHUNKS;
  raw.CHUNK_TARGET_SECONDS ??= raw.TTS_TARGET_CHUNK_SECONDS;
  raw.SILENCE_PADDING_MS ??= raw.TTS_SENTENCE_SILENCE_MS;
  return envSchema.parse(raw);
}
