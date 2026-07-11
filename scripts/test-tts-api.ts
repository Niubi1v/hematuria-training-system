import assert from "node:assert/strict";

process.env.AZURE_SPEECH_KEY = "unit-test-only-key";
process.env.AZURE_SPEECH_REGION = "eastasia";
process.env.TTS_ALLOWED_ORIGINS = "https://niubi1v.github.io";

const originalFetch = globalThis.fetch;
globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
  assert.equal(init?.headers && (init.headers as Record<string, string>)["Ocp-Apim-Subscription-Key"], "unit-test-only-key");
  return new Response(new Uint8Array([0x49, 0x44, 0x33, 0x04]), { status: 200, headers: { "Content-Type": "audio/mpeg" } });
}) as typeof fetch;

const handler = require("../api/tts.js");

async function call(voiceName: string, text: string) {
  let statusCode = 200;
  let payload: unknown;
  const headers: Record<string, string> = {};
  const req = { method: "POST", body: { voiceName, text }, headers: { origin: "https://niubi1v.github.io" }, socket: { remoteAddress: `tts-${voiceName}` } };
  const res = {
    setHeader(name: string, value: string) { headers[name.toLowerCase()] = value; },
    status(code: number) { statusCode = code; return this; },
    json(value: unknown) { payload = value; return this; },
    send(value: unknown) { payload = value; return this; },
    end() { return this; }
  };
  await handler(req, res);
  return { statusCode, payload, headers };
}

async function main() {
  for (const [voiceName, text] of [
    ["zh-CN-XiaoxiaoNeural", "医生您好"], ["zh-CN-YunxiNeural", "医生您好"],
    ["en-US-JennyNeural", "Hello doctor"], ["en-US-GuyNeural", "Hello doctor"]
  ]) {
    const response = await call(voiceName, text);
    assert.equal(response.statusCode, 200, `${voiceName} should return success`);
    assert.equal(response.headers["content-type"], "audio/mpeg", `${voiceName} should return audio/mpeg`);
    assert.ok(Buffer.isBuffer(response.payload), `${voiceName} should return an audio buffer`);
  }
  globalThis.fetch = originalFetch;
  console.log("TTS API contract passed for Chinese female/male and English female/male voices.");
}

void main();
