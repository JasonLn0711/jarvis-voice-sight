import { buildServer, createDependencies } from "../services/orchestrator/src/server.js";
import { loadConfig } from "../services/orchestrator/src/config/env.js";

type Latency = {
  total_ms: number;
  asr_ms: number;
  llm_ms: number;
  tts_ms: number;
  audio_encode_ms: number;
};

type TtsTiming = {
  elapsed_ms: number;
  cache_hit: boolean;
};

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index] ?? 0;
}

function line(label: string, values: number[]): string {
  return `${label}: ${percentile(values, 50)}ms / ${percentile(values, 95)}ms`;
}

const utterances = [
  "text:我明天要面試",
  "text:我今天很累",
  "text:我不太懂",
  "text:我有點生氣",
  "text:我不確定該怎麼辦"
];

async function main() {
  const config = loadConfig({ APP_ENV: "test", ENABLE_EMOTION: "true" });
  const app = await buildServer(createDependencies(config));
  const latencies: Latency[] = [];
  let ttsCacheHits = 0;
  const cachedTtsTimings: TtsTiming[] = [];

  for (let index = 0; index < 40; index += 1) {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/voice-turn",
      payload: {
        session_id: "benchmark_session",
        audio_format: "mock",
        audio_base64: utterances[index % utterances.length],
        client_timestamp: new Date().toISOString()
      }
    });
    if (response.statusCode !== 200) {
      throw new Error(`Benchmark request failed with ${response.statusCode}`);
    }
    const body = response.json();
    latencies.push(body.latency as Latency);
    if (body.tts_cache_hit) {
      ttsCacheHits += 1;
    }
  }

  for (let index = 0; index < 20; index += 1) {
    const start = performance.now();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/tts",
      payload: { text: "你說。", voiceId: "jarvis_default_zh_tw", speed: 1 }
    });
    if (response.statusCode !== 200) {
      throw new Error(`Cached TTS benchmark request failed with ${response.statusCode}`);
    }
    const body = response.json();
    cachedTtsTimings.push({
      elapsed_ms: Math.round(performance.now() - start),
      cache_hit: Boolean(body.ttsCacheHit)
    });
  }

  await app.close();

  const total = latencies.map((latency) => latency.total_ms);
  const asr = latencies.map((latency) => latency.asr_ms);
  const llm = latencies.map((latency) => latency.llm_ms);
  const tts = latencies.map((latency) => latency.tts_ms);
  const audioEncode = latencies.map((latency) => latency.audio_encode_ms);

  console.log("Jarvis mock latency benchmark");
  console.log(line("P50/P95 total latency", total));
  console.log(line("P50/P95 ASR latency", asr));
  console.log(line("P50/P95 LLM latency", llm));
  console.log(line("P50/P95 TTS latency", tts));
  console.log(line("P50/P95 audio encode latency", audioEncode));
  console.log(`TTS cache hits: ${ttsCacheHits}/${latencies.length}`);
  console.log(line("P50/P95 cached TTS endpoint latency", cachedTtsTimings.map((timing) => timing.elapsed_ms)));
  console.log(
    `Cached TTS endpoint hits: ${cachedTtsTimings.filter((timing) => timing.cache_hit).length}/${cachedTtsTimings.length}`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
