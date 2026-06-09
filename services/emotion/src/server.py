from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="Jarvis Mock Emotion Service")


class EmotionRequest(BaseModel):
    text: str
    recentMessages: list[dict] = []


RULES = [
    ("anxious", ["怕", "擔心", "焦慮", "完蛋", "面試"]),
    ("tired", ["累", "疲倦", "沒力"]),
    ("confused", ["不懂", "混亂", "卡住"]),
    ("excited", ["開心", "興奮", "期待"]),
    ("sad", ["難過", "沮喪", "失落"]),
    ("angry", ["生氣", "火大", "不爽"]),
    ("uncertain", ["不確定", "不知道", "猶豫"]),
]


def classify(text: str):
    for label, keywords in RULES:
        signals = [keyword for keyword in keywords if keyword in text]
        if signals:
            return {
                "label": label,
                "confidence": 0.87 if label == "anxious" else 0.78,
                "signals": signals,
                "durationMs": 20,
            }
    return {"label": "neutral", "confidence": 0.64, "signals": [], "durationMs": 20}


@app.get("/health")
def health():
    return {"status": "ok", "service": "emotion", "model": "mock"}


@app.post("/emotion")
def emotion(request: EmotionRequest):
    return classify(request.text)
