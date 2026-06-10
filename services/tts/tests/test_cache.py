import importlib
import os
import tempfile
import unittest


class TTSCachingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp_dir = tempfile.TemporaryDirectory()
        os.environ["TTS_RUNTIME"] = "openai_compatible"
        os.environ["BREEZYVOICE_OUTPUT_DIR"] = cls.temp_dir.name
        os.environ["BREEZYVOICE_CACHE_DIR"] = os.path.join(cls.temp_dir.name, "cache")
        os.environ["BREEZYVOICE_WARMUP_ENABLED"] = "false"
        cls.server = importlib.import_module("services.tts.src.server")

    @classmethod
    def tearDownClass(cls):
        cls.temp_dir.cleanup()

    def setUp(self):
        for path in self.server.BREEZYVOICE_CACHE_DIR.glob("*.wav"):
            path.unlink()

    def test_cache_miss_calls_upstream_and_returns_audio_url(self):
        calls = []

        def fake_uncached(request):
            calls.append(request.text)
            return b"RIFFcache-miss", 123

        original = self.server.synthesize_uncached
        self.server.synthesize_uncached = fake_uncached
        try:
            result = self.server.synthesize_with_cache(
                self.server.TTSRequest(text="好，我在。", voiceId="jarvis_default_zh_tw", speed=1.0)
            )
        finally:
            self.server.synthesize_uncached = original

        self.assertEqual(calls, ["好，我在。"])
        self.assertFalse(result["ttsCacheHit"])
        self.assertEqual(result["upstreamTtsMs"], 123)
        self.assertTrue(result["audioUrl"].startswith("/audio/cache/"))

    def test_cache_hit_skips_upstream(self):
        def fake_uncached(request):
            return b"RIFFcache-hit", 111

        original = self.server.synthesize_uncached
        self.server.synthesize_uncached = fake_uncached
        try:
            request = self.server.TTSRequest(text="你說。", voiceId="jarvis_default_zh_tw", speed=1.0)
            first = self.server.synthesize_with_cache(request)
        finally:
            self.server.synthesize_uncached = original

        self.assertFalse(first["ttsCacheHit"])

        def should_not_call(_request):
            raise AssertionError("upstream TTS should not be called on cache hit")

        self.server.synthesize_uncached = should_not_call
        try:
            second = self.server.synthesize_with_cache(request)
        finally:
            self.server.synthesize_uncached = original

        self.assertTrue(second["ttsCacheHit"])
        self.assertEqual(second["upstreamTtsMs"], 0)
        self.assertTrue(second["audioUrl"].startswith("/audio/cache/"))

    def test_reply_text_is_normalized_before_cache_lookup(self):
        calls = []

        def fake_uncached(request):
            calls.append(request.text)
            return b"RIFFnormalized", 100

        original = self.server.synthesize_uncached
        self.server.synthesize_uncached = fake_uncached
        try:
            result = self.server.synthesize_with_cache(
                self.server.TTSRequest(text="  你 說。 ", voiceId="jarvis_default_zh_tw", speed=1.0)
            )
        finally:
            self.server.synthesize_uncached = original

        self.assertEqual(calls, ["  你 說。 "])
        self.assertEqual(result["normalizedText"], "你說。")
        self.assertTrue(result["audioUrl"].startswith("/audio/cache/"))

    def test_emotion_style_cache_reuses_canonical_audio_without_upstream(self):
        def fake_uncached(request):
            return b"RIFFcanonical", 100

        original = self.server.synthesize_uncached
        self.server.synthesize_uncached = fake_uncached
        try:
            canonical = self.server.TTSRequest(text="你最擔心哪一點？", voiceId="jarvis_default_zh_tw", speed=1.0)
            first = self.server.synthesize_with_cache(canonical)
        finally:
            self.server.synthesize_uncached = original

        self.assertFalse(first["ttsCacheHit"])

        def should_not_call(_request):
            raise AssertionError("emotion style cache should reuse canonical audio")

        self.server.synthesize_uncached = should_not_call
        try:
            styled = self.server.TTSRequest(
                text="你最擔心哪一點？",
                voiceId="jarvis_default_zh_tw",
                speed=1.0,
                emotionStyle="anxious",
            )
            second = self.server.synthesize_with_cache(styled)
        finally:
            self.server.synthesize_uncached = original

        self.assertTrue(second["ttsCacheHit"])
        self.assertEqual(second["upstreamTtsMs"], 0)

    def test_warmup_texts_defaults_to_financial_reply_set(self):
        texts = self.server.warmup_texts()
        self.assertIn("好，我在。", texts)
        self.assertIn("先建立信任感。", texts)
        self.assertIn("避免承諾報酬。", texts)
        self.assertEqual(len(texts), len(set(texts)))

    def test_warmup_tts_synthesizes_all_configured_texts(self):
        calls = []

        def fake_uncached(request):
            calls.append(request.text)
            return f"RIFF{request.text}".encode("utf-8"), 10

        original_uncached = self.server.synthesize_uncached
        original_enabled = self.server.BREEZYVOICE_WARMUP_ENABLED
        original_runtime = self.server.TTS_RUNTIME
        original_texts = self.server.BREEZYVOICE_WARMUP_TEXTS
        original_text = self.server.BREEZYVOICE_WARMUP_TEXT
        self.server.synthesize_uncached = fake_uncached
        self.server.BREEZYVOICE_WARMUP_ENABLED = True
        self.server.TTS_RUNTIME = "openai_compatible"
        self.server.BREEZYVOICE_WARMUP_TEXT = ""
        self.server.BREEZYVOICE_WARMUP_TEXTS = "先建立信任感。|避免承諾報酬。"
        try:
            result = self.server.warmup_tts()
        finally:
            self.server.synthesize_uncached = original_uncached
            self.server.BREEZYVOICE_WARMUP_ENABLED = original_enabled
            self.server.TTS_RUNTIME = original_runtime
            self.server.BREEZYVOICE_WARMUP_TEXTS = original_texts
            self.server.BREEZYVOICE_WARMUP_TEXT = original_text

        self.assertEqual(calls, ["先建立信任感。", "避免承諾報酬。"])
        self.assertEqual(result["completed"], 2)
        self.assertEqual(result["total"], 2)
        self.assertEqual(result["failed"], [])


if __name__ == "__main__":
    unittest.main()
