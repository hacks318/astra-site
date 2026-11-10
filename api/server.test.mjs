import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createAstraApi } from "./server.mjs";

let server;
let baseUrl;
const calls = [];

server = createAstraApi({
  databasePath: ":memory:",
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

test("accounts can sign in on another device and retrieve only their saved conversations", async () => {
  const accountServer = createAstraApi({
    databasePath: ":memory:",
    ollamaUrl: "http://ollama.test",
    model: "test-model",
    fetchImpl: async (url) => {
      if (url.endsWith("/api/tags")) return Response.json({ models: [] });
      return Response.json({ message: { content: "Resposta sincronizada" } });
    },
    rateLimit: 100,
    webOrigins: ["https://hacks318.github.io"]
  });
  await new Promise((resolve) => accountServer.listen(0, "127.0.0.1", resolve));
  const accountUrl = `http://127.0.0.1:${accountServer.address().port}/v1`;
  const request = (path, token, options = {}) => fetch(`${accountUrl}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      Origin: "https://hacks318.github.io",
      ...options.headers
    }
  });

  try {
    const registration = await request("/auth/register", null, {
      method: "POST",
      body: JSON.stringify({ email: "astra@example.com", password: "a-strong-password" })
    });
    assert.equal(registration.status, 200);
    assert.equal(registration.headers.get("access-control-allow-origin"), "https://hacks318.github.io");
    const registered = await registration.json();
    assert.equal(registered.user.email, "astra@example.com");
    assert.ok(registered.token);

    const created = await request("/chats", registered.token, {
      method: "POST",
      body: JSON.stringify({})
    });
    const { chat } = await created.json();
    const messages = [
      { role: "user", content: "Como organizar meu dia?" },
      { role: "assistant", content: "Vamos começar por três prioridades." }
    ];
    const saved = await request(`/chats/${chat.id}`, registered.token, {
      method: "PUT",
      body: JSON.stringify({ messages })
    });
    assert.equal(saved.status, 200);

    const login = await request("/auth/login", null, {
      method: "POST",
      body: JSON.stringify({ email: "ASTRA@example.com", password: "a-strong-password" })
    });
    const loggedIn = await login.json();
    assert.equal(login.status, 200);
    const list = await request("/chats", loggedIn.token);
    assert.equal((await list.json()).chats[0].title, "Como organizar meu dia?");
    const crossDeviceChat = await request(`/chats/${chat.id}`, loggedIn.token);
    assert.deepEqual((await crossDeviceChat.json()).chat.messages, messages);

    const otherAccount = await request("/auth/register", null, {
      method: "POST",
      body: JSON.stringify({ email: "other@example.com", password: "another-strong-password" })
    });
    const other = await otherAccount.json();
    assert.equal((await request(`/chats/${chat.id}`, other.token)).status, 404);
    const badLogin = await request("/auth/login", null, {
      method: "POST",
      body: JSON.stringify({ email: "astra@example.com", password: "wrong-password-1" })
    });
    assert.equal(badLogin.status, 401);
  } finally {
    await new Promise((resolve, reject) => {
      accountServer.close((error) => error ? reject(error) : resolve());
    });
  }
});

test("chat can use a server-managed OpenAI-compatible backend without exposing the key", async () => {
  const upstreamCalls = [];
  const openAiServer = createAstraApi({
    databasePath: ":memory:",
    ollamaUrl: "http://ollama.test",
    model: "test-model",
    fetchImpl: async (url, options) => {
      upstreamCalls.push({ url, options });
      if (url.endsWith("/models")) return Response.json({ data: [{ id: "gpt-4o-mini" }] });
      return Response.json({ choices: [{ message: { content: "Resposta da OpenAI" } }] });
    },
    rateLimit: 100,
    upstreamProvider: "openai",
    openAiApiKey: "server-secret-key"
  });
  await new Promise((resolve) => openAiServer.listen(0, "127.0.0.1", resolve));
  const openAiUrl = `http://127.0.0.1:${openAiServer.address().port}/v1/chat/completions`;
  const response = await fetch(openAiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: "Oi" }] })
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).choices[0].message.content, "Resposta da OpenAI");
  const openAiCall = upstreamCalls.find(({ url }) => url.endsWith("/chat/completions"));
  assert.ok(openAiCall);
  assert.equal(openAiCall.options.headers.Authorization, "Bearer server-secret-key");
  assert.equal(JSON.parse(openAiCall.options.body).messages.at(-1).content, "Oi");
  await new Promise((resolve, reject) => openAiServer.close((error) => error ? reject(error) : resolve()));
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
    databasePath: ":memory:",
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
