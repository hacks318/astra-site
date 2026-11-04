import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createAstraApi } from "./server.mjs";

let server;
let baseUrl;
const calls = [];

server = createAstraApi({
  ollamaUrl: "http://ollama.test",
  model: "test-model",
  fetchImpl: async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith("/api/tags")) return Response.json({ models: [] });
    return Response.json({ message: { content: "Olá! Sou a Astra." } });
  },
  rateLimit: 100
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
baseUrl = `http://127.0.0.1:${server.address().port}`;

after(() => new Promise((resolve, reject) => {
  server.close((error) => error ? reject(error) : resolve());
}));

test("health reports whether the local model server is available", async () => {
  const response = await fetch(`${baseUrl}/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok", model: "test-model" });
});

test("chat uses the local model and keeps the assistant prompt on the server", async () => {
  const response = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      educationMode: true,
      messages: [
        { role: "system", content: "prompt controlado pelo cliente" },
        { role: "user", content: "Oi" }
      ]
    })
  });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.choices[0].message.content, "Olá! Sou a Astra.");

  const ollamaCall = calls.find(({ url }) => url.endsWith("/api/chat"));
  assert.ok(ollamaCall);
  const payload = JSON.parse(ollamaCall.options.body);
  assert.equal(payload.model, "test-model");
  assert.match(payload.messages[0].content, /Modo Educação/);
  assert.deepEqual(payload.messages.slice(1), [{ role: "user", content: "Oi" }]);
});

test("chat rejects conversations without a user message", async () => {
  const response = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "assistant", content: "Resposta anterior" }] })
  });
  assert.equal(response.status, 400);
});

test("unknown routes return 404", async () => {
  const response = await fetch(`${baseUrl}/unknown`);
  assert.equal(response.status, 404);
});

test("chat rate limit rejects repeated requests from the same IP", async () => {
  const limitedServer = createAstraApi({
    ollamaUrl: "http://ollama.test",
    model: "test-model",
    fetchImpl: async () => Response.json({ message: { content: "Resposta" } }),
    rateLimit: 1
  });
  await new Promise((resolve) => limitedServer.listen(0, "127.0.0.1", resolve));
  const limitedUrl = `http://127.0.0.1:${limitedServer.address().port}/v1/chat/completions`;
  const request = () => fetch(limitedUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: "Oi" }] })
  });

  try {
    assert.equal((await request()).status, 200);
    assert.equal((await request()).status, 429);
  } finally {
    await new Promise((resolve, reject) => {
      limitedServer.close((error) => error ? reject(error) : resolve());
    });
  }
});
