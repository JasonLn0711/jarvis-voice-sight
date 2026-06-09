from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="Jarvis Mock LLM Service")


class Emotion(BaseModel):
    label: str = "neutral"
    confidence: float = 0
    signals: list[str] = []


class ChatRequest(BaseModel):
    text: str
    prompt: str | None = None
    emotion: Emotion | None = None


def reply_for(text: str, emotion: Emotion | None) -> str:
    label = emotion.label if emotion else "neutral"
    if "long_output" in text:
        return "這是一段太長太像一般聊天機器人的回答，應該被政策拒絕。"
    if label == "anxious":
        return "先拆一題來練。"
    if label == "tired":
        return "今天最耗你的事是？"
    if label == "confused":
        return "卡住的是哪一步？"
    if label == "excited":
        return "最想先做哪件？"
    if label == "sad":
        return "哪一刻最難受？"
    if label == "angry":
        return "先把那句說出來。"
    if label == "uncertain":
        return "先選一個小步驟。"
    if "面試" in text or "怕" in text:
        return "你最擔心哪部分？"
    if "累" in text:
        return "今天最耗你的事是？"
    return "你想從哪裡說起？"


@app.get("/health")
def health():
    return {"status": "ok", "service": "llm", "model": "mock"}


@app.post("/chat")
def chat(request: ChatRequest):
    return {
        "reply": reply_for(request.text, request.emotion),
        "tokensUsed": 18,
        "durationMs": 180,
        "finishReason": "stop",
    }
