# Jarvis Voice Sight Real Model Integration

Status: Real-model activation guide

This project keeps the frontend and orchestrator model-agnostic. Real AI models
are attached inside the model services:

```text
apps/web -> services/orchestrator -> services/asr
                                -> services/llm
                                -> services/tts
```

The orchestrator still calls the same HTTP contracts. Switching from mock mode
to real mode is controlled by environment variables.

## Source Basis

- Breeze-ASR-25 is a Whisper-large-v2-derived ASR model optimized for
  Taiwanese Mandarin, Traditional Chinese context, Mandarin-English
  code-switching, and timestamp alignment. Its repository documents Hugging
  Face Transformers `pipeline` usage and a patched Whisper CLI path.
- Gemma 4 runs behind a configurable LLM wrapper. The v0.5 default Ollama tag is
  `gemma4:e2b`; `LLM_RUNTIME=vllm` switches the wrapper to an
  OpenAI-compatible vLLM endpoint while ASR and TTS remain independent services.
- BreezyVoice is a Taiwanese Mandarin TTS / voice-cloning system derived from
  CosyVoice. Its repository documents `single_inference.py`, Docker, and an
  OpenAI-compatible API path.

## Activation Modes

### ASR: Breeze-ASR-25 With faster-whisper

Service:

```text
services/asr
```

Runtime:

```env
ASR_PROVIDER=breeze_asr_25
ASR_SERVICE_URL=http://localhost:8001
ASR_RUNTIME=breeze_asr_25
BREEZE_ASR_MODEL_ID=MediaTek-Research/Breeze-ASR-25
BREEZE_ASR_CT2_MODEL_PATH=models/breeze-asr-25-ct2
BREEZE_ASR_DEVICE=cuda
BREEZE_ASR_COMPUTE_TYPE=int8_float16
BREEZE_ASR_LANGUAGE=zh
BREEZE_ASR_BEAM_SIZE=1
BREEZE_ASR_VAD_FILTER=true
```

Install service dependencies:

```bash
python -m venv .venv-asr
. .venv-asr/bin/activate
pip install -r services/asr/requirements.txt
```

Convert Breeze-ASR-25 to CTranslate2 format for `faster-whisper`:

```bash
npm run real:convert-asr
```

For a lower-memory demo, convert with int8:

```bash
BREEZE_ASR_CT2_MODEL_PATH=models/breeze-asr-25-ct2-int8 \
BREEZE_ASR_CT2_QUANTIZATION=int8 \
npm run real:convert-asr
```

Run:

```bash
cd services/asr
uvicorn src.server:app --host 0.0.0.0 --port 8001
```

Contract:

```http
POST /asr
```

The service accepts base64 audio from the orchestrator, writes it to a temporary
file, and calls `faster_whisper.WhisperModel` on the converted
Breeze-ASR-25 CTranslate2 directory. This is the preferred path for low-latency
local ASR because `faster-whisper` uses CTranslate2 and supports quantized
inference.

## LLM: Configurable Gemma Runtime

Service:

```text
services/llm
```

The LLM service supports Ollama, vLLM, OpenAI-compatible, Transformers, and mock
paths behind the same `/chat` and `/chat/stream` wrapper contract.

### Selected Fast Local Demo Path: Ollama

```env
LLM_PROVIDER=ollama
LLM_SERVICE_URL=http://localhost:8002
LLM_RUNTIME=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=gemma4:e2b
OLLAMA_THINK=false
```

Run Gemma in Ollama:

```bash
npm run real:start-ollama
npm run real:pull-gemma
```

This is the recommended first real-model path because it avoids a custom
Transformers serving stack, supports local quantized Gemma variants, and keeps
the Jarvis LLM service as a thin HTTP bridge.

`OLLAMA_THINK=false` is intentional. Jarvis v0.5 is a latency-first voice
loop, so the wrapper disables Gemma 4 thinking mode and asks for short spoken
responses.

`real:start-ollama` defaults to the native Ollama package under
`.local/ollama/extract/bin/ollama` and uses `.local/ollama/models` as the local
model store. Real-model mode is GPU-only: the Ollama log must report `library=CUDA`
on the RTX GPU before Gemma is accepted as ready.

Run the Jarvis LLM service:

```bash
cd services/llm
LLM_RUNTIME=ollama \
OLLAMA_BASE_URL=http://localhost:11434 \
OLLAMA_MODEL=gemma4:e2b \
OLLAMA_THINK=false \
../../.venv-llm/bin/python -m uvicorn src.server:app --host 0.0.0.0 --port 8002
```

### vLLM Runtime

Use this when a vLLM OpenAI-compatible server is the selected LLM runtime.
Ollama / vLLM only replace the LLM runtime; ASR and TTS remain independent
services.

```env
LLM_PROVIDER=vllm
LLM_SERVICE_URL=http://localhost:8002
LLM_RUNTIME=vllm
VLLM_BASE_URL=http://localhost:8000/v1
VLLM_MODEL=google/gemma-4-E2B-it
```

Run the Jarvis LLM wrapper against vLLM:

```bash
cd services/llm
LLM_RUNTIME=vllm \
VLLM_BASE_URL=http://localhost:8000/v1 \
VLLM_MODEL=google/gemma-4-E2B-it \
../../.venv-llm/bin/python -m uvicorn src.server:app --host 0.0.0.0 --port 8002
```

### OpenAI-Compatible Runtime

Use this for LM Studio, llama.cpp server, vLLM, or another local server exposing
`/v1/chat/completions`.

```env
LLM_RUNTIME=openai_compatible
OPENAI_COMPATIBLE_BASE_URL=http://localhost:1234/v1
OPENAI_COMPATIBLE_MODEL=google/gemma-4-E4B-it
OPENAI_COMPATIBLE_API_KEY=
```

### Transformers Runtime

Use this when the local machine has enough memory for direct Hugging Face
loading.

```env
LLM_RUNTIME=transformers
GEMMA_MODEL_ID=google/gemma-4-E4B-it
GEMMA_TRANSFORMERS_DEVICE=cuda
```

Install:

```bash
python -m venv .venv-llm
. .venv-llm/bin/activate
pip install -r services/llm/requirements.txt
```

## TTS: BreezyVoice

Service:

```text
services/tts
```

### Selected Fast Demo Path: BreezyVoice OpenAI-Compatible Runtime

BreezyVoice documents a Docker and OpenAI-compatible API workflow. Use that
first for product demo latency because the model stays warm in a long-running
service instead of launching `single_inference.py` on every Jarvis turn.

Start BreezyVoice following its repository, then use the Jarvis helper to launch
the warm OpenAI-compatible upstream with CUDA:

```bash
git clone https://github.com/mtkresearch/BreezyVoice.git ../BreezyVoice
npm run real:start-breezyvoice
```

The helper expects the BreezyVoice repo at `../BreezyVoice`, checks CUDA through
the BreezyVoice venv, adds the required NVIDIA library paths, and serves the
upstream on port `9003`.

Configure Jarvis:

```env
TTS_PROVIDER=breezyvoice
TTS_SERVICE_URL=http://localhost:8003
TTS_RUNTIME=openai_compatible
OPENAI_TTS_BASE_URL=http://localhost:9003/v1
OPENAI_TTS_MODEL=breezyvoice
OPENAI_TTS_API_KEY=
```

The Jarvis TTS wrapper stays on port `8003`. The upstream BreezyVoice
OpenAI-compatible server should run on a different port such as `9003`. The
wrapper calls `/v1/audio/speech`, stores the returned WAV file in
`BREEZYVOICE_OUTPUT_DIR`, and returns `/audio/{file}.wav` to the orchestrator.

### Local Voice Prompt: `260610_0127_record.mp3`

The local recording can be used as the BreezyVoice prompt voice. Prepare a
short, clean reference clip before starting the BreezyVoice upstream:

```bash
mkdir -p .local/voice-prompts
ffmpeg -y \
  -i /home/jnclaw/every_on_git_jnclaw/project_aura/260610_0127_record/260610_0127_record.mp3 \
  -ac 1 \
  -ar 16000 \
  -t 6 \
  .local/voice-prompts/260610_0127_record_prompt_6s.wav
```

Create a matching prompt transcript file. The text must describe the prompt
audio, not the Jarvis reply. This keeps BreezyVoice zero-shot cloning aligned
with the input text it should synthesize:

```bash
printf '%s\n' '很多人高中畢業之後還想要做很多的事情我不知道你們大家所有人高中的志願是什麼' \
  > .local/voice-prompts/260610_0127_record_prompt_6s.txt
```

Use the generated prompt WAV and transcript when launching BreezyVoice:

```env
BREEZYVOICE_SPEAKER_PROMPT_AUDIO_PATH=.local/voice-prompts/260610_0127_record_prompt_6s.wav
BREEZYVOICE_SPEAKER_PROMPT_TEXT_FILE=.local/voice-prompts/260610_0127_record_prompt_6s.txt
BREEZYVOICE_REQUIRE_PROMPT_TEXT=true
```

The native GPU helper uses these prompt paths by default. If BreezyVoice was
already started with an empty or wrong prompt transcript, restart the upstream:

```bash
BREEZYVOICE_RESTART=true npm run real:start-breezyvoice
```

Do not use CPU-only `onnxruntime` or CPU-only Torch for this path. BreezyVoice
must expose CUDA execution through the RTX GPU before its output is accepted as
the real demo TTS path.

Providing matched prompt text is required for this real demo path. Empty prompt
text can make BreezyVoice drift away from the LLM output or speak incoherently,
because the zero-shot prompt audio and prompt transcription no longer describe
the same voice sample.

### Fallback Path: BreezyVoice CLI Runtime

Clone and install BreezyVoice separately:

```bash
git clone https://github.com/mtkresearch/BreezyVoice.git ../BreezyVoice
cd ../BreezyVoice
pip install -r requirements.txt
```

Configure Jarvis:

This path is an API-shape fallback only. It must still run on the RTX GPU; a
CPU-only CLI run is not accepted for the real demo.

```env
TTS_PROVIDER=breezyvoice
TTS_SERVICE_URL=http://localhost:8003
TTS_RUNTIME=breezyvoice_cli
BREEZYVOICE_REPO_PATH=/absolute/path/to/BreezyVoice
BREEZYVOICE_MODEL_PATH=MediaTek-Research/BreezyVoice
BREEZYVOICE_SPEAKER_PROMPT_AUDIO_PATH=/absolute/path/to/BreezyVoice/data/tc_speaker.wav
BREEZYVOICE_SPEAKER_PROMPT_TEXT=在密碼學中，加密是將明文資訊改變為難以讀取的密文內容。
BREEZYVOICE_PYTHON=python
BREEZYVOICE_TIMEOUT_S=45
BREEZYVOICE_OUTPUT_DIR=/tmp/jarvis-breezyvoice-audio
```

Run:

```bash
cd services/tts
uvicorn src.server:app --host 0.0.0.0 --port 8003
```

The TTS service calls `single_inference.py`, stores generated `.wav` files in
`BREEZYVOICE_OUTPUT_DIR`, and serves them at `/audio/{file}.wav`.

### Generic OpenAI-Compatible TTS Runtime

Use this if BreezyVoice is already served behind an OpenAI-compatible
`/v1/audio/speech` endpoint.

```env
TTS_RUNTIME=openai_compatible
OPENAI_TTS_BASE_URL=http://localhost:9003/v1
OPENAI_TTS_MODEL=breezyvoice
OPENAI_TTS_API_KEY=
```

## Recommended Fast Real-Model Settings

The orchestrator must call the model services through real providers:

```env
ASR_PROVIDER=breeze_asr_25
LLM_PROVIDER=gemma_4_e4b
TTS_PROVIDER=breezyvoice
ENABLE_EMOTION=true
EMOTION_PROVIDER=mock

ASR_RUNTIME=breeze_asr_25
LLM_RUNTIME=ollama
TTS_RUNTIME=openai_compatible

ASR_TIMEOUT_MS=8000
LLM_TIMEOUT_MS=8000
TTS_TIMEOUT_MS=15000
TOTAL_TIMEOUT_MS=25000
```

The larger timeouts are for first real-model testing. After warmup, reduce them
and rerun latency benchmarks.

## Next Optimization: BreezyVoice Latency

The real stack is now in demo territory: Breeze-ASR, the configurable Gemma LLM
wrapper, and BreezyVoice all run through RTX GPU-backed services, and
BreezyVoice follows the LLM output after matched zero-shot prompt transcription
is provided.

Current measured bottleneck:

```text
real voice-turn total: 7.45s
TTS stage: 6.8s
target v0.5 average real turn: under 4s
```

Do not change models before optimizing the TTS path. The next engineering pass
should:

1. Keep Jarvis voice replies in the 6-18 character voice range; use `REPLY_MAX_CHARS=14` for latency-critical demos.
2. Warm up BreezyVoice by synthesizing `好，我在。` after startup.
3. Cache fixed short replies:

```text
好，我在。
你說。
我懂。
繼續說。
你最擔心哪一點？
```

4. Add `audio_encode_ms` and structured stage logs.
5. Use sentence-level streaming and bounded parallel long-form synthesis for
   longer replies.

Acceptance for this optimization pass:

```text
cached TTS reply < 500ms
uncached real turn reports full latency breakdown
BreezyVoice output still follows the cleaned LLM/policy text
```

## Preflight

Run:

```bash
npm run real:health
npm run real:preflight
```

This checks:

1. Orchestrator real-provider wiring through `npm run real:health`.
2. Breeze-ASR-25 CTranslate2 model directory.
3. Native Ollama binary and configured Ollama model.
4. Native Ollama RTX CUDA backend evidence.
5. Ollama server reachability.
6. BreezyVoice OpenAI-compatible upstream reachability.

## Smoke Test

Start services:

```bash
npm run dev
```

Then run one real audio request from a base64 `.wav` payload through the web UI,
or use the debug ASR endpoint:

```bash
curl -s http://localhost:3000/api/v1/health
```

Expected health provider values:

```json
{
  "providers": {
    "asr": "breeze_asr_25",
    "llm": "gemma_4_e4b",
    "tts": "breezyvoice"
  }
}
```

## Engineering Rules

1. Keep mock mode working.
2. Keep the frontend unaware of model internals.
3. Keep the orchestrator contract unchanged.
4. Every real model call must have a timeout.
5. Every real model failure must fall back through existing orchestrator policy.
6. Run `npm run typecheck`, `npm run lint`, `npm run test`, and a real-model
   smoke test after activation.
