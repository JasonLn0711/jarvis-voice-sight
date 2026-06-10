import { z } from "zod";

const providerSchema = z.enum(["mock", "http", "breeze_asr_25", "gemma_4_e2b", "gemma_4_e4b", "breezyvoice"]);

const envSchema = z.object({
  APP_ENV: z.string().default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  ASR_PROVIDER: providerSchema.default("mock"),
  ASR_SERVICE_URL: z.string().url().default("http://localhost:8001"),
  LLM_PROVIDER: providerSchema.default("mock"),
  LLM_SERVICE_URL: z.string().url().default("http://localhost:8002"),
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
  PLAYBACK_DELAY_MAX_MS: z.coerce.number().int().nonnegative().default(2000)
});

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(overrides: Partial<NodeJS.ProcessEnv> = {}): AppConfig {
  return envSchema.parse({ ...process.env, ...overrides });
}
