import { loadConfig } from "../services/orchestrator/src/config/env.js";
import { buildServer, createDependencies } from "../services/orchestrator/src/server.js";

const config = loadConfig({
  APP_ENV: "test",
  ASR_PROVIDER: "breeze_asr_25",
  LLM_PROVIDER: "gemma_4_e2b",
  TTS_PROVIDER: "breezyvoice",
  EMOTION_PROVIDER: "mock"
});

async function main() {
  const app = await buildServer(createDependencies(config));
  const response = await app.inject({ method: "GET", url: "/api/v1/health" });
  console.log(response.body);
  await app.close();
}

void main();
