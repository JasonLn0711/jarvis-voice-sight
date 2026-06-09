import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const requiredFiles = [
  "README.md",
  "docs/API_SPEC.md",
  "docs/PROMPT_SPEC.md",
  "docs/LATENCY_BUDGET.md",
  "docs/UI_UX_SPEC.md",
  "docs/RUNBOOK.md",
  "apps/web/src/app/page.tsx",
  "apps/web/src/components/VoiceOrb.tsx",
  "services/orchestrator/src/server.ts",
  "services/orchestrator/src/usecases/VoiceTurnUseCase.ts"
];

for (const file of requiredFiles) {
  if (!existsSync(join(root, file))) {
    throw new Error(`Missing required file: ${file}`);
  }
}

const uiFiles = [
  "apps/web/src/app/page.tsx",
  "apps/web/src/components/JarvisReplyCard.tsx",
  "apps/web/src/components/TranscriptCard.tsx"
];

const forbidden = ["raw JSON", "AI is thinking", "Error occurred!!!", "Start recording now!!!"];
for (const file of uiFiles) {
  const content = readFileSync(join(root, file), "utf8");
  for (const phrase of forbidden) {
    if (content.includes(phrase)) {
      throw new Error(`Forbidden UI phrase "${phrase}" found in ${file}`);
    }
  }
}

console.log("Lint checks passed");
