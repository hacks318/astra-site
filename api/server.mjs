import http from "node:http";
import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SYSTEM_PROMPT =
  "Você é Astra, uma assistente prestativa e acolhedora. Responda em português brasileiro, com clareza e sem inventar detalhes.";
const EDUCATION_PROMPT =
  "Modo Educação: ensine segurança digital defensiva a alunos e professores com linguagem apropriada e situações fictícias. Priorize identificar phishing e golpes, proteger contas, privacidade e autenticação em duas etapas. Crie planos de aula, atividades seguras e quizzes. Nunca peça senhas, códigos de verificação, dados pessoais ou que alguém abra links suspeitos. Não ensine invasão, exploração de sistemas, malware, roubo de credenciais, evasão ou contorno de proteções. Recuse esses pedidos brevemente e redirecione para prevenção.";
const MAX_BODY_BYTES = 32_000;
const MAX_MESSAGES = 12;
const MAX_MESSAGE_CHARS = 6_000;
const MAX_TOTAL_CHARS = 20_000;
const WINDOW_MS = 60_000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_SAVED_MESSAGES = 200;
const MAX_SAVED_CHARS = 200_000;

function jsonResponse(response, status, payload) {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(JSON.stringify(payload));
}

async function readJson(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      const error = new Error("A solicitação excede o limite permitido.");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("O corpo da solicitação não contém JSON válido.");
    error.statusCode = 400;
    throw error;
  }
}

function validateMessages(input) {
  if (!Array.isArray(input) || input.length === 0 || input.length > MAX_MESSAGES) {
    throw new Error(`Envie de 1 a ${MAX_MESSAGES} mensagens.`);
  }

  let totalChars = 0;
  const messages = [];
  for (const message of input) {
    if (
      !message ||
      !["user", "assistant"].includes(message.role) ||
      typeof message.content !== "string"
    ) {
      continue;
    }
    const content = message.content.trim();
    if (!content || content.length > MAX_MESSAGE_CHARS) {
      throw new Error("Cada mensagem deve ter entre 1 e 6.000 caracteres.");
    }
    totalChars += content.length;
    messages.push({ role: message.role, content });
  }

  if (messages.length === 0 || totalChars > MAX_TOTAL_CHARS) {
    throw new Error("A conversa está vazia ou excede o limite de contexto.");
  }
  if (messages.at(-1).role !== "user") {
    throw new Error("A última mensagem precisa ser do usuário.");
  }
  return messages;
}

function getClientKey(request) {
  const forwardedFor = request.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.trim()) {
    return forwardedFor.split(",")[0].trim();
  }
  return request.socket.remoteAddress || "unknown";
}

function createRateLimiter({ limit = 8, windowMs = WINDOW_MS, now = Date.now } = {}) {
  const clients = new Map();
  return (key) => {
    const currentTime = now();
    const timestamps = (clients.get(key) || []).filter(
      (timestamp) => currentTime - timestamp < windowMs
    );
    if (clients.size > 10_000) {
      for (const [clientKey, history] of clients) {
        if (history.every((timestamp) => currentTime - timestamp >= windowMs)) {
          clients.delete(clientKey);
        } else if (clients.size > 10_000) {
          clients.delete(clientKey);
        }
      }
    }
    if (timestamps.length >= limit) {
      clients.set(key, timestamps);
      return false;
    }
    timestamps.push(currentTime);
    clients.set(key, timestamps);
    return true;
  };
}

function createAccountStore(databasePath) {
  if (databasePath !== ":memory:") {
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  }
  const database = new DatabaseSync(databasePath);
  database.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_salt TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS conversations_user_updated
      ON conversations(user_id, updated_at DESC);
    CREATE TABLE IF NOT EXISTS messages (
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      PRIMARY KEY(conversation_id, position)
    );
  `);
  return database;
}

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

function validEmail(value) {
  return typeof value === "string" &&
    value.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validateSavedMessages(input) {
  if (!Array.isArray(input) || input.length === 0 || input.length > MAX_SAVED_MESSAGES) {
    throw new Error(`Salve de 1 a ${MAX_SAVED_MESSAGES} mensagens por conversa.`);
  }
  let totalChars = 0;
  const messages = input.map((message) => {
    if (!message || !["user", "assistant"].includes(message.role) || typeof message.content !== "string") {
      throw new Error("A conversa contém uma mensagem inválida.");
    }
    const content = message.content.trim();
    if (!content || content.length > MAX_MESSAGE_CHARS) {
      throw new Error("Cada mensagem deve ter entre 1 e 6.000 caracteres.");
    }
    totalChars += content.length;
    return { role: message.role, content };
  });
  if (totalChars > MAX_SAVED_CHARS) {
    throw new Error("A conversa excede o limite de armazenamento.");
  }
  return messages;
}

export function createAstraApi({
  ollamaUrl = process.env.OLLAMA_URL || "http://ollama:11434",
  model = process.env.ASTRA_MODEL || "qwen2.5:3b",
  fetchImpl = fetch,
  rateLimit = Number.parseInt(process.env.ASTRA_RATE_LIMIT || "8", 10),
  upstreamProvider = (process.env.ASTRA_PROVIDER || process.env.UPSTREAM_PROVIDER || "ollama").toLowerCase(),
  openAiBaseUrl = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, ""),
  openAiApiKey = process.env.OPENAI_API_KEY || "",
  databasePath = process.env.ASTRA_DATABASE_PATH || path.join(process.env.ASTRA_DATA_DIR || "data", "astra.sqlite"),
  webOrigins = (process.env.ASTRA_WEB_ORIGINS || "https://hacks318.github.io,http://localhost:3000,http://127.0.0.1:5500")
    .split(",").map((origin) => origin.trim()).filter(Boolean)
} = {}) {
  const allowRequest = createRateLimiter({ limit: rateLimit });
  const allowAccountRequest = createRateLimiter({ limit: 6, windowMs: 15 * 60_000 });
  const database = createAccountStore(databasePath);
  let activeRequests = 0;

  function setCorsHeaders(request, response) {
    const origin = request.headers.origin;
    if (typeof origin === "string" && webOrigins.includes(origin)) {
      response.setHeader("Access-Control-Allow-Origin", origin);
      response.setHeader("Vary", "Origin");
      response.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
      response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
      response.setHeader("Access-Control-Max-Age", "600");
    }
  }

  function readSession(request) {
    const authorization = request.headers.authorization;
    if (typeof authorization !== "string" || !authorization.startsWith("Bearer ")) return null;
    const token = authorization.slice(7);
    if (!/^[\w-]{40,100}$/.test(token)) return null;
    const tokenHash = hashToken(token);
    const session = database.prepare(
      `SELECT users.id, users.email, sessions.expires_at
       FROM sessions JOIN users ON users.id = sessions.user_id
       WHERE sessions.token_hash = ?`
    ).get(tokenHash);
    if (!session) return null;
    if (session.expires_at <= Date.now()) {
      database.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash);
      return null;
    }
    return { id: session.id, email: session.email, tokenHash };
  }

  function issueSession(userId) {
    const token = randomBytes(32).toString("base64url");
    const expiresAt = Date.now() + SESSION_TTL_MS;
    database.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)")
      .run(hashToken(token), userId, expiresAt);
    return { token, expiresAt };
  }

  function requireSession(request, response) {
    const user = readSession(request);
    if (!user) {
      jsonResponse(response, 401, { error: "Entre na sua conta para acessar as conversas." });
      return null;
    }
    return user;
  }

  async function handleAccountRequest(request, response) {
    const { method, url } = request;
    const pathname = url.split("?")[0];
    if (method === "POST" && ["/v1/auth/register", "/v1/auth/login"].includes(pathname)) {
      if (!allowAccountRequest(getClientKey(request))) {
        jsonResponse(response, 429, { error: "Muitas tentativas. Aguarde 15 minutos e tente novamente." });
        return true;
      }
      if (!String(request.headers["content-type"] || "").includes("application/json")) {
        jsonResponse(response, 415, { error: "Envie os dados como application/json." });
        return true;
      }
      const body = await readJson(request);
      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      const password = typeof body.password === "string" ? body.password : "";
      if (!validEmail(email)) {
        jsonResponse(response, 400, { error: "Informe um e-mail válido." });
        return true;
      }
      if (password.length < 12 || password.length > 128) {
        jsonResponse(response, 400, { error: "A senha deve ter entre 12 e 128 caracteres." });
        return true;
      }

      let user;
      if (pathname === "/v1/auth/register") {
        const salt = randomBytes(16).toString("hex");
        const passwordHash = scryptSync(password, salt, 64).toString("hex");
        try {
          user = { id: randomUUID(), email };
          database.prepare(
            "INSERT INTO users (id, email, password_salt, password_hash, created_at) VALUES (?, ?, ?, ?, ?)"
          ).run(user.id, email, salt, passwordHash, Date.now());
        } catch (error) {
          if (String(error.message).includes("UNIQUE constraint failed")) {
            jsonResponse(response, 409, { error: "Este e-mail já possui uma conta." });
            return true;
          }
          throw error;
        }
      } else {
        const stored = database.prepare(
          "SELECT id, email, password_salt, password_hash FROM users WHERE email = ?"
        ).get(email);
        const salt = stored?.password_salt || "00000000000000000000000000000000";
        const expected = stored?.password_hash || "00".repeat(64);
        const actual = scryptSync(password, salt, 64);
        const matches = timingSafeEqual(actual, Buffer.from(expected, "hex"));
        if (!stored || !matches) {
          jsonResponse(response, 401, { error: "E-mail ou senha incorretos." });
          return true;
        }
        user = { id: stored.id, email: stored.email };
      }
      const session = issueSession(user.id);
      jsonResponse(response, 200, { token: session.token, expiresAt: session.expiresAt, user });
      return true;
    }

    if (!pathname.startsWith("/v1/auth/") && !pathname.startsWith("/v1/chats")) return false;
    const user = requireSession(request, response);
    if (!user) return true;

    if (method === "GET" && pathname === "/v1/auth/me") {
      jsonResponse(response, 200, { user: { id: user.id, email: user.email } });
      return true;
    }
    if (method === "POST" && pathname === "/v1/auth/logout") {
      database.prepare("DELETE FROM sessions WHERE token_hash = ?").run(user.tokenHash);
      jsonResponse(response, 200, { status: "ok" });
      return true;
    }
    if (method === "GET" && pathname === "/v1/chats") {
      const chats = database.prepare(
        "SELECT id, title, created_at AS createdAt, updated_at AS updatedAt FROM conversations WHERE user_id = ? ORDER BY updated_at DESC"
      ).all(user.id);
      jsonResponse(response, 200, { chats });
      return true;
    }
    if (method === "POST" && pathname === "/v1/chats") {
      const id = randomUUID();
      const now = Date.now();
      database.prepare(
        "INSERT INTO conversations (id, user_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
      ).run(id, user.id, "Nova conversa", now, now);
      jsonResponse(response, 201, { chat: { id, title: "Nova conversa", messages: [], createdAt: now, updatedAt: now } });
      return true;
    }

    const chatMatch = pathname.match(/^\/v1\/chats\/([0-9a-f-]{36})$/i);
    if (!chatMatch) return false;
    const chatId = chatMatch[1];
    const chat = database.prepare(
      "SELECT id, title, created_at AS createdAt, updated_at AS updatedAt FROM conversations WHERE id = ? AND user_id = ?"
    ).get(chatId, user.id);
    if (!chat) {
      jsonResponse(response, 404, { error: "Conversa não encontrada." });
      return true;
    }
    if (method === "GET") {
      const messages = database.prepare(
        "SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY position"
      ).all(chatId);
      jsonResponse(response, 200, { chat: { ...chat, messages } });
      return true;
    }
    if (method === "PUT") {
      if (!String(request.headers["content-type"] || "").includes("application/json")) {
        jsonResponse(response, 415, { error: "Envie os dados como application/json." });
        return true;
      }
      const body = await readJson(request);
      const messages = validateSavedMessages(body.messages);
      const title = messages.find((message) => message.role === "user").content.slice(0, 80);
      const now = Date.now();
      const update = database.prepare(
        "UPDATE conversations SET title = ?, updated_at = ? WHERE id = ? AND user_id = ?"
      );
      const deleteMessages = database.prepare("DELETE FROM messages WHERE conversation_id = ?");
      const insertMessage = database.prepare(
        "INSERT INTO messages (conversation_id, position, role, content) VALUES (?, ?, ?, ?)"
      );
      database.exec("BEGIN");
      try {
        update.run(title, now, chatId, user.id);
        deleteMessages.run(chatId);
        messages.forEach((message, index) => {
          insertMessage.run(chatId, index, message.role, message.content);
        });
        database.exec("COMMIT");
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
      jsonResponse(response, 200, { chat: { ...chat, title, updatedAt: now, messages } });
      return true;
    }
    if (method === "DELETE") {
      database.prepare("DELETE FROM conversations WHERE id = ? AND user_id = ?").run(chatId, user.id);
      jsonResponse(response, 200, { status: "ok" });
      return true;
    }
    return false;
  }

  async function requestUpstreamCompletion({ systemPrompt, messages }) {
    if (upstreamProvider === "openai") {
      if (!openAiApiKey) {
        throw Object.assign(new Error("A chave da API OpenAI do servidor não está configurada."), { statusCode: 503 });
      }
      const upstreamModel = process.env.OPENAI_MODEL || model;
      const upstreamResponse = await fetchImpl(`${openAiBaseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + openAiApiKey
        },
        body: JSON.stringify({
          model: upstreamModel,
          messages: [{ role: "system", content: systemPrompt }, ...messages],
          stream: false
        }),
        signal: AbortSignal.timeout(120_000)
      });
      if (!upstreamResponse.ok) {
        const errorText = await upstreamResponse.text().catch(() => "");
        throw Object.assign(new Error(errorText || "O provedor externo não conseguiu responder."), {
          statusCode: upstreamResponse.status || 502
        });
      }
      const result = await upstreamResponse.json();
      const content = result?.choices?.[0]?.message?.content;
      if (typeof content !== "string" || !content.trim()) {
        throw Object.assign(new Error("O provedor externo retornou uma resposta vazia."), {
          statusCode: 502
        });
      }
      return content;
    }

    const ollamaResponse = await fetchImpl(`${ollamaUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: systemPrompt }, ...messages],
        stream: false,
        keep_alive: "10m"
      }),
      signal: AbortSignal.timeout(120_000)
    });

    if (!ollamaResponse.ok) {
      throw Object.assign(new Error("O modelo da Astra não conseguiu responder."), { statusCode: 502 });
    }

    const result = await ollamaResponse.json();
    const content = result?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      throw Object.assign(new Error("O modelo retornou uma resposta vazia."), { statusCode: 502 });
    }
    return content;
  }

  const server = http.createServer(async (request, response) => {
    setCorsHeaders(request, response);
    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return;
    }
    try {
      if (await handleAccountRequest(request, response)) return;
    } catch (error) {
      const status = Number.isInteger(error.statusCode) ? error.statusCode : 400;
      jsonResponse(response, status, { error: error.message || "Não foi possível processar a solicitação." });
      return;
    }
    if (request.method === "GET" && request.url === "/health") {
      try {
        if (upstreamProvider === "openai") {
          if (!openAiApiKey) throw new Error("A chave da API OpenAI do servidor não está configurada.");
          const upstreamResponse = await fetchImpl(`${openAiBaseUrl}/models`, {
            headers: { Authorization: "Bearer " + openAiApiKey },
            signal: AbortSignal.timeout(5_000)
          });
          if (!upstreamResponse.ok) throw new Error("OpenAI não está disponível.");
          jsonResponse(response, 200, { status: "ok", model: process.env.OPENAI_MODEL || model });
          return;
        }
        const ollamaResponse = await fetchImpl(`${ollamaUrl}/api/tags`, {
          signal: AbortSignal.timeout(5_000)
        });
        if (!ollamaResponse.ok) throw new Error("Ollama não está disponível.");
        jsonResponse(response, 200, { status: "ok", model });
      } catch {
        jsonResponse(response, 503, { error: "O serviço de IA está iniciando ou indisponível." });
      }
      return;
    }

    if (request.method !== "POST" || request.url !== "/v1/chat/completions") {
      jsonResponse(response, 404, { error: "Rota não encontrada." });
      return;
    }

    if (!String(request.headers["content-type"] || "").includes("application/json")) {
      jsonResponse(response, 415, { error: "Envie a conversa como application/json." });
      return;
    }

    if (!allowRequest(getClientKey(request))) {
      jsonResponse(response, 429, { error: "Limite temporário atingido. Tente novamente em um minuto." });
      return;
    }
    if (activeRequests >= 2) {
      jsonResponse(response, 503, { error: "A Astra está ocupada. Tente novamente em instantes." });
      return;
    }

    activeRequests += 1;
    try {
      const body = await readJson(request);
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        throw new Error("O corpo da solicitação precisa ser um objeto JSON.");
      }
      if (body.stream === true) {
        jsonResponse(response, 400, { error: "Respostas em fluxo ainda não estão disponíveis." });
        return;
      }

      const messages = validateMessages(body.messages);
      const systemPrompt = body.educationMode === true
        ? `${SYSTEM_PROMPT}\n\n${EDUCATION_PROMPT}`
        : SYSTEM_PROMPT;

      const content = await requestUpstreamCompletion({ systemPrompt, messages });

      jsonResponse(response, 200, {
        id: `astra-${randomUUID()}`,
        object: "chat.completion",
        choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }]
      });
    } catch (error) {
      const status = Number.isInteger(error.statusCode) ? error.statusCode : 400;
      jsonResponse(response, status, { error: error.message || "Não foi possível processar a conversa." });
    } finally {
      activeRequests -= 1;
    }
  });
  server.on("close", () => database.close());
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number.parseInt(process.env.PORT || "8080", 10);
  const host = process.env.HOST || "127.0.0.1";
  const server = createAstraApi();
  server.listen(port, host, () => {
    console.log(`API Astra ouvindo em ${host}:${port}.`);
  });
}
