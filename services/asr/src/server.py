from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="Jarvis Mock ASR Service")


class ASRRequest(BaseModel):
    audio_format: str
    audio_base64: str


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


@app.get("/health")
def health():
    return {"status": "ok", "service": "asr", "model": "mock"}


@app.post("/asr")
def asr(request: ASRRequest):
    text = "" if request.audio_base64 in {"empty", "asr_empty"} else transcript_for(request.audio_base64)
    return {
        "text": text,
        "language": "zh-TW",
        "confidence": 0.93 if text else 0.0,
        "durationMs": 120,
        "segments": [{"startMs": 0, "endMs": 900, "text": text}] if text else [],
    }
