from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="Jarvis Mock TTS Service")


class TTSRequest(BaseModel):
    text: str
    voiceId: str = "jarvis_default_zh_tw"
    speed: float | None = 1.0
    pitch: float | None = None
    emotionStyle: str | None = None


@app.get("/health")
def health():
    return {"status": "ok", "service": "tts", "model": "mock"}


@app.post("/tts")
def tts(request: TTSRequest):
    return {
        "audioUrl": f"/mock-audio/{request.text}.wav",
        "durationMs": 160,
        "format": "wav",
    }
