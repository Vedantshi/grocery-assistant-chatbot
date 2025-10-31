// Minimal LLM probe to validate provider configuration without starting the server
try { require('dotenv').config(); } catch {}

(async () => {
  try {
    const { chatWithOllama: chat } = require('../src/ollamaService');
    const provider = process.env.LLM_PROVIDER || (process.env.OPENAI_API_KEY ? 'openai' : 'ollama');
    const reply = await chat('Quick ping', [], [], []);
    const out = { ok: true, provider, preview: String(reply || '').slice(0, 80) };
    console.log(JSON.stringify(out));
    process.exit(0);
  } catch (e) {
    const provider = process.env.LLM_PROVIDER || (process.env.OPENAI_API_KEY ? 'openai' : 'ollama');
    const out = { ok: false, provider, error: e?.message || String(e) };
    console.log(JSON.stringify(out));
    process.exit(1);
  }
})();
