import json
import os
import time
import urllib.error
import urllib.request
from functools import lru_cache

from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

app = FastAPI(title="Jarvis Gemma LLM Service")

LLM_RUNTIME = os.getenv("LLM_RUNTIME", "mock")
GEMMA_MODEL_ID = os.getenv("GEMMA_MODEL_ID", "google/gemma-4-E4B-it")
GEMMA_TRANSFORMERS_DEVICE = os.getenv("GEMMA_TRANSFORMERS_DEVICE", "cuda")
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "gemma4:e2b")
OLLAMA_THINK = os.getenv("OLLAMA_THINK", "false").lower() == "true"
OPENAI_COMPATIBLE_BASE_URL = os.getenv("OPENAI_COMPATIBLE_BASE_URL", "http://localhost:1234/v1")
OPENAI_COMPATIBLE_API_KEY = os.getenv("OPENAI_COMPATIBLE_API_KEY", "")
OPENAI_COMPATIBLE_MODEL = os.getenv("OPENAI_COMPATIBLE_MODEL", GEMMA_MODEL_ID)
VLLM_BASE_URL = os.getenv("VLLM_BASE_URL", "http://localhost:8000/v1")
VLLM_MODEL = os.getenv("VLLM_MODEL", "gemma-4-e2b")
LLM_GENERATION_TIMEOUT_S = float(os.getenv("LLM_GENERATION_TIMEOUT_S", "30"))


class Emotion(BaseModel):
    label: str = "neutral"
    confidence: float = 0
    signals: list[str] = []


class ChatRequest(BaseModel):
    text: str
    prompt: str | None = None
    emotion: Emotion | None = None
    turn_id: str | None = None


def post_json(url: str, payload: dict, headers: dict | None = None, timeout: float = LLM_GENERATION_TIMEOUT_S):
    data = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json", **(headers or {})},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def system_prompt(request: ChatRequest) -> str:
    return request.prompt or (
        "You are Jarvis, a low-presence Taiwanese Mandarin Voice Coach for insurance and financial service conversations. "
        "Always reply in Traditional Chinese. Reply in 6 to 18 Chinese characters. "
        "Do not always ask questions. Prefer acknowledgement, reflection, light guidance, or one concise next sentence. "
        "Never recommend products, promise returns, or pressure the customer."
    )


def generate_with_ollama(request: ChatRequest):
    start = time.perf_counter()
    payload = {
        "model": OLLAMA_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt(request)},
            {"role": "user", "content": request.text},
        ],
        "stream": False,
        "think": OLLAMA_THINK,
        "options": {"temperature": 0.4, "num_predict": 48},
    }
    result = post_json(f"{OLLAMA_BASE_URL.rstrip('/')}/api/chat", payload)
    reply = result.get("message", {}).get("content", "").strip()
    if not reply:
        reply = "我懂你的意思。"
    return {
        "reply": reply,
        "tokensUsed": result.get("eval_count"),
        "durationMs": int((time.perf_counter() - start) * 1000),
        "finishReason": "stop",
    }


def stream_with_ollama(request: ChatRequest):
    payload = {
        "model": OLLAMA_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt(request)},
            {"role": "user", "content": request.text},
        ],
        "stream": True,
        "think": OLLAMA_THINK,
        "options": {"temperature": 0.4, "num_predict": 48},
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"{OLLAMA_BASE_URL.rstrip('/')}/api/chat",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=LLM_GENERATION_TIMEOUT_S) as response:
        for raw_line in response:
            if not raw_line.strip():
                continue
            event = json.loads(raw_line.decode("utf-8"))
            token = event.get("message", {}).get("content", "")
            if token:
                yield {"token": token, "done": False}
            if event.get("done"):
                yield {"done": True}
                return


def generate_with_openai_compatible_runtime(request: ChatRequest, base_url: str, model: str):
    start = time.perf_counter()
    headers = {"Authorization": f"Bearer {OPENAI_COMPATIBLE_API_KEY}"} if OPENAI_COMPATIBLE_API_KEY else {}
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt(request)},
            {"role": "user", "content": request.text},
        ],
        "temperature": 0.4,
        "max_tokens": 48,
    }
    result = post_json(
        f"{base_url.rstrip('/')}/chat/completions",
        payload,
        headers=headers,
    )
    choice = result.get("choices", [{}])[0]
    reply = choice.get("message", {}).get("content", "").strip()
    usage = result.get("usage", {})
    return {
        "reply": reply,
        "tokensUsed": usage.get("completion_tokens"),
        "durationMs": int((time.perf_counter() - start) * 1000),
        "finishReason": choice.get("finish_reason", "stop"),
    }


def generate_with_openai_compatible(request: ChatRequest):
    return generate_with_openai_compatible_runtime(
        request,
        OPENAI_COMPATIBLE_BASE_URL,
        OPENAI_COMPATIBLE_MODEL,
    )


def generate_with_vllm(request: ChatRequest):
    return generate_with_openai_compatible_runtime(request, VLLM_BASE_URL, VLLM_MODEL)


def resolve_transformers_device():
    if GEMMA_TRANSFORMERS_DEVICE != "cuda":
        raise RuntimeError(f"GPU-only policy requires GEMMA_TRANSFORMERS_DEVICE=cuda, got {GEMMA_TRANSFORMERS_DEVICE}")
    try:
        import torch

        if torch.cuda.is_available():
            return "cuda"
    except Exception:
        pass
    raise RuntimeError("GPU-only policy requires CUDA for Gemma transformers runtime")


@lru_cache(maxsize=1)
def get_gemma_transformers():
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer

    device = resolve_transformers_device()
    tokenizer = AutoTokenizer.from_pretrained(GEMMA_MODEL_ID)
    model = AutoModelForCausalLM.from_pretrained(
        GEMMA_MODEL_ID,
        torch_dtype=torch.bfloat16,
        device_map="auto",
    )
    return tokenizer, model


def generate_with_transformers(request: ChatRequest):
    start = time.perf_counter()
    tokenizer, model = get_gemma_transformers()
    messages = [
        {"role": "system", "content": system_prompt(request)},
        {"role": "user", "content": request.text},
    ]
    if hasattr(tokenizer, "apply_chat_template"):
        input_ids = tokenizer.apply_chat_template(messages, add_generation_prompt=True, return_tensors="pt")
    else:
        input_ids = tokenizer(f"{system_prompt(request)}\nUser: {request.text}\nAssistant:", return_tensors="pt").input_ids
    input_ids = input_ids.to(model.device)
    output = model.generate(input_ids, max_new_tokens=48, do_sample=True, temperature=0.4)
    generated = output[0][input_ids.shape[-1] :]
    reply = tokenizer.decode(generated, skip_special_tokens=True).strip()
    return {
        "reply": reply,
        "tokensUsed": int(generated.shape[-1]),
        "durationMs": int((time.perf_counter() - start) * 1000),
        "finishReason": "stop",
    }


def reply_for(text: str, emotion: Emotion | None) -> str:
    label = emotion.label if emotion else "neutral"
    if "long_output" in text:
        return "這是一段太長太像一般聊天機器人的回答，應該被政策拒絕。"
    if label == "anxious":
        return "先穩住，我在。"
    if label == "tired":
        return "先讓腦袋休息。"
    if label == "confused":
        return "這裡先慢慢理。"
    if label == "excited":
        return "這個方向不錯。"
    if label == "sad":
        return "這真的不好受。"
    if label == "angry":
        return "先把那句說出來。"
    if label == "uncertain":
        return "先選一個小步驟。"
    if "新客戶" in text or "拜訪" in text:
        return "先抓住目標。"
    if "排斥" in text or "抗拒" in text:
        return "先不要急著推。"
    if "防備" in text:
        return "先聊他的生活。"
    if "三十多歲" in text or "小孩" in text:
        return "家庭責任是切入點。"
    if "像推銷" in text:
        return "用關心的語氣。"
    if "家庭支出" in text:
        return "可以，這很自然。"
    if "風險缺口" in text:
        return "這比推產品好。"
    if "顧問" in text or "不是業務" in text:
        return "這就是信任感。"
    if "知道怎麼開場" in text:
        return "可以，先穩穩聊。"
    if "保險" in text or "保單" in text or "投保" in text:
        return "先建立信任感。"
    if "排斥" in text or "抗拒" in text or "不想買" in text:
        return "先聽他的顧慮。"
    if "開場" in text or "開口" in text or "第一句" in text:
        return "用關心開場。"
    if "報酬" in text or "獲利" in text or "收益" in text:
        return "避免承諾報酬。"
    if "商品" in text or "產品" in text or "基金" in text:
        return "不要先談商品。"
    if "客訴" in text or "抱怨" in text or "不滿" in text:
        return "先接住情緒。"
    if "語氣" in text or "太急" in text or "壓迫" in text:
        return "語氣再放慢。"
    if "風險" in text or "理財" in text or "資產" in text:
        return "先釐清他的目標。"
    if "面試" in text or "怕" in text:
        return "先抓一個重點。"
    if "累" in text:
        return "你可以慢慢說。"
    if "延遲" in text or "latency" in text.lower():
        return "這裡先求穩。"
    if "專案" in text:
        return "先講產品手感。"
    return "我懂你的意思。"


@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "llm",
        "runtime": LLM_RUNTIME,
        "model": {
            "mock": "mock",
            "ollama": OLLAMA_MODEL,
            "vllm": VLLM_MODEL,
            "openai_compatible": OPENAI_COMPATIBLE_MODEL,
            "transformers": GEMMA_MODEL_ID,
        }.get(LLM_RUNTIME, "mock"),
        "loaded": get_gemma_transformers.cache_info().currsize > 0,
    }


@app.post("/chat")
def chat(request: ChatRequest):
    if LLM_RUNTIME == "ollama":
        return generate_with_ollama(request)
    if LLM_RUNTIME == "openai_compatible":
        return generate_with_openai_compatible(request)
    if LLM_RUNTIME == "vllm":
        return generate_with_vllm(request)
    if LLM_RUNTIME == "transformers":
        return generate_with_transformers(request)

    return {
        "reply": reply_for(request.text, request.emotion),
        "tokensUsed": 18,
        "durationMs": 180,
        "finishReason": "stop",
    }


@app.post("/chat/stream")
def chat_stream(request: ChatRequest):
    def events():
        if LLM_RUNTIME == "ollama":
            yield from stream_with_ollama(request)
            return

        if LLM_RUNTIME == "openai_compatible":
            reply = generate_with_openai_compatible(request)["reply"]
        elif LLM_RUNTIME == "vllm":
            reply = generate_with_vllm(request)["reply"]
        elif LLM_RUNTIME == "transformers":
            reply = generate_with_transformers(request)["reply"]
        else:
            reply = reply_for(request.text, request.emotion)

        for token in reply:
            yield {"token": token, "done": False}
        yield {"done": True}

    def lines():
        for event in events():
            yield json.dumps(event, ensure_ascii=False) + "\n"

    return StreamingResponse(lines(), media_type="application/x-ndjson")
