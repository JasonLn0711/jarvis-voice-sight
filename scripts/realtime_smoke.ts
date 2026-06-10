import { chromium, type Browser } from "playwright";
import { mkdirSync, openSync } from "node:fs";
import { spawn, type ChildProcess } from "node:child_process";

const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL ?? "http://127.0.0.1:3000";
const WEB_URL = process.env.WEB_URL ?? "http://localhost:3001";
const ROOT = process.cwd();

declare global {
  interface Window {
    __JARVIS_TEST_SPEECH_LEVEL__?: number;
    __JARVIS_TEST_PLAYBACK_ACTIVE__?: boolean;
  }
}

type StartedProcess = {
  name: string;
  child: ChildProcess;
};

async function reachable(url: string): Promise<boolean> {
  try {
    const response = await fetch(url);
    return response.ok;
  } catch {
    return false;
  }
}

function startProcess(name: string, args: string[], logPath: string): StartedProcess {
  mkdirSync(".local", { recursive: true });
  const logFd = openSync(logPath, "a");
  const child = spawn("npm", args, {
    cwd: ROOT,
    stdio: ["ignore", logFd, logFd],
    detached: false
  });
  return { name, child };
}

async function waitFor(url: string, label: string, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await reachable(url)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`${label} did not become reachable at ${url}`);
}

function stopStarted(processes: StartedProcess[]) {
  for (const processInfo of processes.reverse()) {
    if (!processInfo.child.killed) {
      processInfo.child.kill("SIGTERM");
    }
  }
}

async function main() {
  const started: StartedProcess[] = [];
  let browser: Browser | undefined;
  try {
    if (!(await reachable(`${ORCHESTRATOR_URL}/api/v1/health`))) {
      started.push(
        startProcess("orchestrator", ["run", "dev", "-w", "services/orchestrator"], ".local/realtime-smoke-orchestrator.log")
      );
    }
    if (!(await reachable(WEB_URL))) {
      started.push(startProcess("web", ["run", "dev", "-w", "apps/web"], ".local/realtime-smoke-web.log"));
    }

    await waitFor(`${ORCHESTRATOR_URL}/api/v1/health`, "orchestrator");
    await waitFor(WEB_URL, "web");

    browser = await chromium.launch({
      headless: true,
      args: [
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
        "--disable-web-security",
        "--disable-features=BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessSendPreflights"
      ]
    });
    const context = await browser.newContext({
      permissions: ["microphone"],
      baseURL: WEB_URL
    });
    const page = await context.newPage();
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") {
        if (message.text().includes("/_next/webpack-hmr")) {
          return;
        }
        consoleErrors.push(message.text());
      }
    });
    page.on("pageerror", (error) => {
      consoleErrors.push(error.message);
    });

    await page.goto("/", { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "Jarvis Voice Sight" }).waitFor();
    await page.getByText("A real-time insurance voice coach powered by RTX GPU inference.").waitFor();
    await page.getByRole("button", { name: "enable realtime mode" }).click();
    await page.locator("p", { hasText: /realtime listening|realtime user speaking|realtime asr processing/ }).waitFor({ timeout: 10_000 });
    await page.evaluate(() => {
      window.__JARVIS_TEST_PLAYBACK_ACTIVE__ = true;
      window.__JARVIS_TEST_SPEECH_LEVEL__ = 0.2;
    });
    await page.getByText("Interrupted.").waitFor({ timeout: 2_000 });
    await page.evaluate(() => {
      window.__JARVIS_TEST_PLAYBACK_ACTIVE__ = false;
      window.__JARVIS_TEST_SPEECH_LEVEL__ = 0;
    });
    await page.locator("p", { hasText: /realtime listening/ }).waitFor({ timeout: 2_000 });
    await page.getByRole("button", { name: "realtime listening" }).click();

    const streamResult = await page.evaluate(async ({ url }) => {
      const response = await fetch(`${url}/api/v1/voice-turn-stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: "browser_realtime_smoke",
          audio_format: "mock",
          audio_base64: "text:我想先整理一下",
          client_timestamp: new Date().toISOString()
        })
      });
      if (!response.ok || !response.body) {
        throw new Error(`stream request failed: ${response.status}`);
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const events: Array<Record<string, unknown>> = [];
      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (line.trim()) {
            events.push(JSON.parse(line));
          }
        }
      }
      if (buffer.trim()) {
        events.push(JSON.parse(buffer));
      }
      return events;
    }, { url: ORCHESTRATOR_URL });

    const startedEvent = streamResult.find((event) => event.type === "voice_turn_started");
    const audioEvents = streamResult.filter((event) => event.type === "audio_chunk");
    const completedEvent = streamResult.find((event) => event.type === "voice_turn_completed");
    if (!startedEvent || !completedEvent || audioEvents.length === 0) {
      throw new Error(`stream events incomplete: ${JSON.stringify(streamResult)}`);
    }
    if (completedEvent.turn_id !== startedEvent.turn_id) {
      throw new Error("stream turn_id changed between start and completion");
    }
    if (audioEvents.some((event) => event.turn_id !== startedEvent.turn_id)) {
      throw new Error("audio event used stale turn_id");
    }
    if (audioEvents.some((event) => typeof event.chunk_id !== "string" || typeof event.sequence !== "number")) {
      throw new Error("audio chunk event missed chunk_id or sequence");
    }
    if (consoleErrors.length > 0) {
      throw new Error(`browser console errors: ${consoleErrors.join(" | ")}`);
    }

    console.log(
      JSON.stringify(
        {
          status: "ok",
          web: WEB_URL,
          orchestrator: ORCHESTRATOR_URL,
          streamEvents: streamResult.map((event) => event.type),
          audioChunks: audioEvents.length,
          bargeIn: "interrupted_then_listening",
          turnId: startedEvent.turn_id
        },
        null,
        2
      )
    );
  } finally {
    await browser?.close();
    stopStarted(started);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
