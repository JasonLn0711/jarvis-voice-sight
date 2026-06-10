import base64
import os
import tempfile
import time
from functools import lru_cache

from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="Jarvis ASR Service")

ASR_RUNTIME = os.getenv("ASR_RUNTIME", "mock")
BREEZE_ASR_MODEL_ID = os.getenv("BREEZE_ASR_MODEL_ID", "MediaTek-Research/Breeze-ASR-25")
BREEZE_ASR_CT2_MODEL_PATH = os.getenv("BREEZE_ASR_CT2_MODEL_PATH", "models/breeze-asr-25-ct2")
BREEZE_ASR_DEVICE = os.getenv("BREEZE_ASR_DEVICE", "cuda")
BREEZE_ASR_COMPUTE_TYPE = os.getenv("BREEZE_ASR_COMPUTE_TYPE", "int8_float16")
BREEZE_ASR_LANGUAGE = os.getenv("BREEZE_ASR_LANGUAGE", "zh")
BREEZE_ASR_BEAM_SIZE = int(os.getenv("BREEZE_ASR_BEAM_SIZE", "1"))
BREEZE_ASR_VAD_FILTER = os.getenv("BREEZE_ASR_VAD_FILTER", "true") == "true"


class ASRRequest(BaseModel):
    audio_format: str
    audio_base64: str
    turn_id: str | None = None


def transcript_for(audio_base64: str) -> str:
    if audio_base64.startswith("text:"):
        return audio_base64.removeprefix("text:").strip()
    if "tired" in audio_base64:
        return "我今天很累"
    if "angry" in audio_base64:
        return "我有點生氣"
    if "confused" in audio_base64:
        return "我不太懂"
    if "sad" in audio_base64:
        return "我有點難過"
    if "uncertain" in audio_base64:
        return "我不確定該怎麼辦"
    return "我明天要面試"


def decode_audio_to_tempfile(audio_base64: str, audio_format: str) -> str:
    payload = audio_base64.split(",", 1)[1] if "," in audio_base64 else audio_base64
    suffix = f".{audio_format}" if audio_format in {"wav", "mp3", "webm"} else ".wav"
    audio_bytes = base64.b64decode(payload)
    handle = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    handle.write(audio_bytes)
    handle.flush()
    handle.close()
    return handle.name


def resolve_device():
    if BREEZE_ASR_DEVICE != "cuda":
        raise RuntimeError(f"GPU-only policy requires BREEZE_ASR_DEVICE=cuda, got {BREEZE_ASR_DEVICE}")
    try:
        import torch

        if torch.cuda.is_available():
            return "cuda"
    except Exception:
        pass
    raise RuntimeError("GPU-only policy requires CUDA for Breeze-ASR-25")


@lru_cache(maxsize=1)
def get_breeze_model():
    from faster_whisper import WhisperModel

    return WhisperModel(
        BREEZE_ASR_CT2_MODEL_PATH,
        device=resolve_device(),
        compute_type=BREEZE_ASR_COMPUTE_TYPE,
    )


def transcribe_with_breeze(request: ASRRequest):
    start = time.perf_counter()
    audio_path = decode_audio_to_tempfile(request.audio_base64, request.audio_format)
    try:
        recognizer = get_breeze_model()
        segments_iter, info = recognizer.transcribe(
            audio_path,
            language=BREEZE_ASR_LANGUAGE,
            beam_size=BREEZE_ASR_BEAM_SIZE,
            vad_filter=BREEZE_ASR_VAD_FILTER,
            condition_on_previous_text=False,
        )
        segments = []
        texts = []
        for segment in segments_iter:
            segment_text = segment.text.strip()
            texts.append(segment_text)
            segments.append(
                {
                    "startMs": max(0, int(segment.start * 1000)),
                    "endMs": max(0, int(segment.end * 1000)),
                    "text": segment_text,
                }
            )
        text = "".join(texts).strip()
        language_probability = getattr(info, "language_probability", 0.0) or 0.0
        confidence = max(0.0, min(1.0, float(language_probability)))
        response = {
            "text": text,
            "language": "zh-TW",
            "confidence": confidence,
            "durationMs": int((time.perf_counter() - start) * 1000),
            "segments": segments,
        }
        return response
    finally:
        try:
            os.unlink(audio_path)
        except OSError:
            pass


@app.get("/health")
def health():
    loaded = get_breeze_model.cache_info().currsize > 0
    return {
        "status": "ok",
        "service": "asr",
        "runtime": ASR_RUNTIME,
        "model": BREEZE_ASR_CT2_MODEL_PATH if ASR_RUNTIME == "breeze_asr_25" else "mock",
        "sourceModel": BREEZE_ASR_MODEL_ID,
        "engine": "faster-whisper" if ASR_RUNTIME == "breeze_asr_25" else "mock",
        "loaded": loaded,
    }


@app.post("/asr")
def asr(request: ASRRequest):
    if ASR_RUNTIME == "breeze_asr_25" and request.audio_format != "mock":
        return transcribe_with_breeze(request)

    text = "" if request.audio_base64 in {"empty", "asr_empty"} else transcript_for(request.audio_base64)
    return {
        "text": text,
        "language": "zh-TW",
        "confidence": 0.93 if text else 0.0,
        "durationMs": 120,
        "segments": [{"startMs": 0, "endMs": 900, "text": text}] if text else [],
    }
