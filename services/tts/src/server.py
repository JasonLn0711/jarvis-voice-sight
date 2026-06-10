import base64
import hashlib
import json
import logging
import os
import shutil
import subprocess
import time
import uuid
import urllib.request
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

app = FastAPI(title="Jarvis BreezyVoice TTS Service")
logger = logging.getLogger("jarvis.tts")
logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))

TTS_RUNTIME = os.getenv("TTS_RUNTIME", "mock")
BREEZYVOICE_REPO_PATH = os.getenv("BREEZYVOICE_REPO_PATH", "")
BREEZYVOICE_MODEL_PATH = os.getenv("BREEZYVOICE_MODEL_PATH", "MediaTek-Research/BreezyVoice")
BREEZYVOICE_SPEAKER_PROMPT_AUDIO_PATH = os.getenv("BREEZYVOICE_SPEAKER_PROMPT_AUDIO_PATH", "")
BREEZYVOICE_SPEAKER_PROMPT_TEXT = os.getenv("BREEZYVOICE_SPEAKER_PROMPT_TEXT", "")
BREEZYVOICE_PYTHON = os.getenv("BREEZYVOICE_PYTHON", "python")
BREEZYVOICE_TIMEOUT_S = str(os.getenv("BREEZYVOICE_TIMEOUT_S", "45"))
BREEZYVOICE_OUTPUT_DIR = Path(os.getenv("BREEZYVOICE_OUTPUT_DIR", "/tmp/jarvis-breezyvoice-audio"))
BREEZYVOICE_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
BREEZYVOICE_CACHE_DIR = Path(os.getenv("BREEZYVOICE_CACHE_DIR", str(BREEZYVOICE_OUTPUT_DIR / "cache")))
BREEZYVOICE_CACHE_DIR.mkdir(parents=True, exist_ok=True)
BREEZYVOICE_WARMUP_TEXT = os.getenv("BREEZYVOICE_WARMUP_TEXT", "好，我在。")
BREEZYVOICE_WARMUP_TEXTS = os.getenv("BREEZYVOICE_WARMUP_TEXTS", "")
BREEZYVOICE_WARMUP_ENABLED = os.getenv("BREEZYVOICE_WARMUP_ENABLED", "true").lower() == "true"
BREEZYVOICE_WARMUP_TIMEOUT_S = float(os.getenv("BREEZYVOICE_WARMUP_TIMEOUT_S", "60"))

OPENAI_TTS_BASE_URL = os.getenv("OPENAI_TTS_BASE_URL", "http://localhost:9003/v1")
OPENAI_TTS_API_KEY = os.getenv("OPENAI_TTS_API_KEY", "")
OPENAI_TTS_MODEL = os.getenv("OPENAI_TTS_MODEL", "breezyvoice")

app.mount("/audio", StaticFiles(directory=str(BREEZYVOICE_OUTPUT_DIR)), name="audio")

FIXED_CACHE_REPLIES = {
    "好，我在。",
    "你說。",
    "我懂。",
    "繼續說。",
    "你最擔心哪一點？",
    "用一句話收尾。",
    "這個成果很關鍵。",
    "先講產品感。",
    "先講延遲目標。",
    "先講備援方案。",
    "研究重點很清楚。",
    "自我介紹先求穩。",
    "先抓一個重點。",
    "這句再短一點。",
    "先講產品手感。",
    "先穩住，我在。",
    "我懂你的意思。",
    "這樣講可以。",
    "你可以慢慢說。",
    "先抓最小版本。",
    "你已經接近了。",
    "這裡先求穩。",
    "先建立信任感。",
    "先聽他的顧慮。",
    "用關心開場。",
    "先釐清他的目標。",
    "不要先談商品。",
    "避免承諾報酬。",
    "這裡要保守講。",
    "先尊重他的節奏。",
    "先接住情緒。",
    "語氣再放慢。",
    "先抓住目標。",
    "先不要急著推。",
    "先聊他的生活。",
    "家庭責任是切入點。",
    "用關心的語氣。",
    "可以，這很自然。",
    "這比推產品好。",
    "這就是信任感。",
    "可以，先穩穩聊。",
}

DEFAULT_WARMUP_REPLIES = [
    "好，我在。",
    "先建立信任感。",
    "先聽他的顧慮。",
    "用關心開場。",
    "先釐清他的目標。",
    "不要先談商品。",
    "避免承諾報酬。",
    "這裡要保守講。",
    "先尊重他的節奏。",
    "先接住情緒。",
    "語氣再放慢。",
    "先抓住目標。",
    "先不要急著推。",
    "先聊他的生活。",
    "家庭責任是切入點。",
    "用關心的語氣。",
    "可以，這很自然。",
    "這比推產品好。",
    "這就是信任感。",
    "可以，先穩穩聊。",
]


class TTSRequest(BaseModel):
    text: str
    voiceId: str = "jarvis_default_zh_tw"
    speed: float | None = 1.0
    pitch: float | None = None
    emotionStyle: str | None = None


def now_ms(start: float) -> int:
    return int((time.perf_counter() - start) * 1000)


def tts_timeout_s() -> float:
    return float(os.getenv("BREEZYVOICE_TIMEOUT_S", BREEZYVOICE_TIMEOUT_S))


def normalize_text(text: str) -> str:
    return "".join(text.strip().split())


def warmup_texts() -> list[str]:
    raw = BREEZYVOICE_WARMUP_TEXTS.strip()
    if raw:
        parts = raw.replace("\\n", "\n").replace("|", "\n").replace(",", "\n").splitlines()
        texts = [normalize_text(part) for part in parts if normalize_text(part)]
    else:
        texts = [normalize_text(text) for text in DEFAULT_WARMUP_REPLIES]

    if BREEZYVOICE_WARMUP_TEXT:
        texts.insert(0, normalize_text(BREEZYVOICE_WARMUP_TEXT))

    seen = set()
    unique_texts = []
    for text in texts:
        if text not in seen:
            seen.add(text)
            unique_texts.append(text)
    return unique_texts


def cache_key(request: TTSRequest, normalized_text: str) -> str:
    payload = {
        "text": normalized_text,
        "voiceId": request.voiceId,
        "speed": request.speed,
        "pitch": request.pitch,
        "emotionStyle": request.emotionStyle,
        "format": "wav",
    }
    encoded = json.dumps(payload, sort_keys=True, ensure_ascii=False).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def cache_path_for(request: TTSRequest, normalized_text: str) -> Path:
    return BREEZYVOICE_CACHE_DIR / f"{cache_key(request, normalized_text)}.wav"


def canonical_cache_path_for(request: TTSRequest, normalized_text: str) -> Path:
    canonical = TTSRequest(
        text=normalized_text,
        voiceId=request.voiceId,
        speed=request.speed,
        pitch=request.pitch,
        emotionStyle=None,
    )
    return cache_path_for(canonical, normalized_text)


def audio_url_for(path: Path) -> str:
    relative = path.relative_to(BREEZYVOICE_OUTPUT_DIR)
    return f"/audio/{relative.as_posix()}"


def should_cache(normalized_text: str) -> bool:
    return normalized_text in FIXED_CACHE_REPLIES


def encode_audio(audio: bytes) -> tuple[str, int]:
    start = time.perf_counter()
    encoded = base64.b64encode(audio).decode("ascii")
    return encoded, now_ms(start)


def response_from_audio(
    *,
    audio: bytes,
    output_path: Path,
    start: float,
    cache_hit: bool,
    upstream_tts_ms: int,
    normalized_text: str,
) -> dict:
    audio_base64, audio_encode_ms = encode_audio(audio)
    total_ms = now_ms(start)
    logger.info(
        json.dumps(
            {
                "event": "tts_completed",
                "tts_cache_hit": cache_hit,
                "upstream_tts_ms": upstream_tts_ms,
                "audio_encode_ms": audio_encode_ms,
                "total_tts_ms": total_ms,
                "normalized_text": normalized_text,
            },
            ensure_ascii=False,
        )
    )
    return {
        "audioUrl": audio_url_for(output_path),
        "audioBase64": audio_base64,
        "ttsCacheHit": cache_hit,
        "upstreamTtsMs": upstream_tts_ms,
        "audioEncodeMs": audio_encode_ms,
        "normalizedText": normalized_text,
        "durationMs": total_ms,
        "format": "wav",
    }


def synthesize_with_breezyvoice_cli_uncached(request: TTSRequest) -> tuple[bytes, int]:
    if not BREEZYVOICE_REPO_PATH:
        raise RuntimeError("BREEZYVOICE_REPO_PATH is required for TTS_RUNTIME=breezyvoice_cli")
    if not BREEZYVOICE_SPEAKER_PROMPT_AUDIO_PATH:
        raise RuntimeError("BREEZYVOICE_SPEAKER_PROMPT_AUDIO_PATH is required for BreezyVoice voice cloning")

    start = time.perf_counter()
    output_path = BREEZYVOICE_OUTPUT_DIR / f"tmp_{uuid.uuid4().hex}.wav"
    command = [
        BREEZYVOICE_PYTHON,
        "single_inference.py",
        "--content_to_synthesize",
        normalize_text(request.text),
        "--speaker_prompt_audio_path",
        BREEZYVOICE_SPEAKER_PROMPT_AUDIO_PATH,
        "--output_path",
        str(output_path),
        "--model_path",
        BREEZYVOICE_MODEL_PATH,
    ]
    if BREEZYVOICE_SPEAKER_PROMPT_TEXT:
        command.extend(["--speaker_prompt_text_transcription", BREEZYVOICE_SPEAKER_PROMPT_TEXT])

    subprocess.run(
        command,
        cwd=BREEZYVOICE_REPO_PATH,
        check=True,
        timeout=tts_timeout_s(),
        env={**os.environ, "PYTHONUTF8": "1"},
    )
    audio = output_path.read_bytes()
    try:
        output_path.unlink()
    except OSError:
        pass
    return audio, now_ms(start)


def synthesize_with_openai_compatible_uncached(request: TTSRequest) -> tuple[bytes, int]:
    start = time.perf_counter()
    payload = json.dumps(
        {
            "model": OPENAI_TTS_MODEL,
            "voice": request.voiceId,
            "input": normalize_text(request.text),
            "response_format": "wav",
        }
    ).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    if OPENAI_TTS_API_KEY:
        headers["Authorization"] = f"Bearer {OPENAI_TTS_API_KEY}"
    req = urllib.request.Request(
        f"{OPENAI_TTS_BASE_URL.rstrip('/')}/audio/speech",
        data=payload,
        headers=headers,
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=tts_timeout_s()) as response:
        audio = response.read()
    return audio, now_ms(start)


def synthesize_uncached(request: TTSRequest) -> tuple[bytes, int]:
    if TTS_RUNTIME == "breezyvoice_cli":
        return synthesize_with_breezyvoice_cli_uncached(request)
    if TTS_RUNTIME == "openai_compatible":
        return synthesize_with_openai_compatible_uncached(request)
    return b"", 0


def synthesize_with_cache(request: TTSRequest):
    start = time.perf_counter()
    normalized_text = normalize_text(request.text)
    if should_cache(normalized_text):
        output_path = cache_path_for(request, normalized_text)
        if output_path.exists():
            return response_from_audio(
                audio=output_path.read_bytes(),
                output_path=output_path,
                start=start,
                cache_hit=True,
                upstream_tts_ms=0,
                normalized_text=normalized_text,
            )

        canonical_path = canonical_cache_path_for(request, normalized_text)
        if request.emotionStyle and canonical_path.exists():
            shutil.copyfile(canonical_path, output_path)
            return response_from_audio(
                audio=output_path.read_bytes(),
                output_path=output_path,
                start=start,
                cache_hit=True,
                upstream_tts_ms=0,
                normalized_text=normalized_text,
            )

        audio, upstream_tts_ms = synthesize_uncached(request)
        output_path.write_bytes(audio)
        return response_from_audio(
            audio=audio,
            output_path=output_path,
            start=start,
            cache_hit=False,
            upstream_tts_ms=upstream_tts_ms,
            normalized_text=normalized_text,
        )

    audio, upstream_tts_ms = synthesize_uncached(request)
    output_path = BREEZYVOICE_OUTPUT_DIR / f"{uuid.uuid4().hex}.wav"
    output_path.write_bytes(audio)
    return response_from_audio(
        audio=audio,
        output_path=output_path,
        start=start,
        cache_hit=False,
        upstream_tts_ms=upstream_tts_ms,
        normalized_text=normalized_text,
    )


def warmup_tts() -> dict | None:
    if not BREEZYVOICE_WARMUP_ENABLED or TTS_RUNTIME == "mock":
        return None
    original_timeout = os.environ.get("BREEZYVOICE_TIMEOUT_S")
    deadline = time.perf_counter() + BREEZYVOICE_WARMUP_TIMEOUT_S
    completed = 0
    cache_hits = 0
    failed: list[dict] = []
    texts = warmup_texts()
    try:
        os.environ["BREEZYVOICE_TIMEOUT_S"] = str(BREEZYVOICE_WARMUP_TIMEOUT_S)
        for text in texts:
            if time.perf_counter() >= deadline:
                failed.append({"text": text, "error": "warmup timed out"})
                break
            try:
                request = TTSRequest(text=text, voiceId="jarvis_default_zh_tw", speed=1.0)
                result = synthesize_with_cache(request)
                completed += 1
                if result["ttsCacheHit"]:
                    cache_hits += 1
                logger.info(
                    json.dumps(
                        {
                            "event": "tts_warmup_item_completed",
                            "text": normalize_text(text),
                            "duration_ms": result["durationMs"],
                            "tts_cache_hit": result["ttsCacheHit"],
                        },
                        ensure_ascii=False,
                    )
                )
            except Exception as error:
                failed.append({"text": text, "error": str(error)})
                time.sleep(0.25)
        summary = {
            "completed": completed,
            "total": len(texts),
            "cacheHits": cache_hits,
            "failed": failed,
        }
        logger.info(
            json.dumps(
                {
                    "event": "tts_warmup_completed",
                    **summary,
                },
                ensure_ascii=False,
            )
        )
        return summary
    finally:
        if original_timeout is None:
            os.environ.pop("BREEZYVOICE_TIMEOUT_S", None)
        else:
            os.environ["BREEZYVOICE_TIMEOUT_S"] = original_timeout


def warmup_cache_status() -> tuple[int, int]:
    texts = warmup_texts()
    ready = 0
    for text in texts:
        request = TTSRequest(text=text, voiceId="jarvis_default_zh_tw", speed=1.0)
        if cache_path_for(request, normalize_text(text)).exists():
            ready += 1
    return ready, len(texts)


def legacy_warmup_cache_exists() -> bool:
    return cache_path_for(
        TTSRequest(text=BREEZYVOICE_WARMUP_TEXT, voiceId="jarvis_default_zh_tw", speed=1.0),
        normalize_text(BREEZYVOICE_WARMUP_TEXT),
    ).exists()


@app.on_event("startup")
def startup_warmup():
    warmup_tts()


@app.get("/health")
def health():
    warmup_ready, warmup_total = warmup_cache_status()
    return {
        "status": "ok",
        "service": "tts",
        "runtime": TTS_RUNTIME,
        "model": {
            "mock": "mock",
            "breezyvoice_cli": BREEZYVOICE_MODEL_PATH,
            "openai_compatible": OPENAI_TTS_MODEL,
        }.get(TTS_RUNTIME, "mock"),
        "upstream": OPENAI_TTS_BASE_URL if TTS_RUNTIME == "openai_compatible" else None,
        "outputDir": str(BREEZYVOICE_OUTPUT_DIR),
        "cacheDir": str(BREEZYVOICE_CACHE_DIR),
        "warmupText": BREEZYVOICE_WARMUP_TEXT,
        "warmupTexts": warmup_texts(),
        "warmupCacheExists": legacy_warmup_cache_exists(),
        "warmupCacheReady": warmup_ready,
        "warmupCacheTotal": warmup_total,
    }


@app.post("/tts")
def tts(request: TTSRequest):
    if TTS_RUNTIME in {"breezyvoice_cli", "openai_compatible"}:
        return synthesize_with_cache(request)

    normalized_text = normalize_text(request.text)
    return {
        "audioUrl": f"/mock-audio/{normalized_text}.wav",
        "ttsCacheHit": should_cache(normalized_text),
        "upstreamTtsMs": 0,
        "audioEncodeMs": 0,
        "normalizedText": normalized_text,
        "durationMs": 160,
        "format": "wav",
    }
