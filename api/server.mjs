import http from "node:http";
import { randomUUID } from "node:crypto";
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

export function createAstraApi({
  ollamaUrl = process.env.OLLAMA_URL || "http://ollama:11434",
  model = process.env.ASTRA_MODEL || "qwen2.5:3b",
  fetchImpl = fetch,
  rateLimit = Number.parseInt(process.env.ASTRA_RATE_LIMIT || "8", 10)
} = {}) {
  const allowRequest = createRateLimiter({ limit: rateLimit });
  let activeRequests = 0;

  return http.createServer(async (request, response) => {
    if (request.method === "GET" && request.url === "/health") {
      try {
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
      let ollamaResponse;
      try {
        ollamaResponse = await fetchImpl(`${ollamaUrl}/api/chat`, {
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
      } catch {
        jsonResponse(response, 503, { error: "O modelo da Astra está indisponível ou demorou demais para responder." });
        return;
      }

      if (!ollamaResponse.ok) {
        jsonResponse(response, 502, { error: "O modelo da Astra não conseguiu responder." });
        return;
      }

      let result;
      try {
        result = await ollamaResponse.json();
      } catch {
        jsonResponse(response, 502, { error: "O modelo retornou uma resposta inválida." });
        return;
      }
      const content = result?.message?.content;
      if (typeof content !== "string" || !content.trim()) {
        jsonResponse(response, 502, { error: "O modelo retornou uma resposta vazia." });
        return;
      }

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
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number.parseInt(process.env.PORT || "8080", 10);
  const host = process.env.HOST || "127.0.0.1";
  const server = createAstraApi();
  server.listen(port, host, () => {
    console.log(`API Astra ouvindo em ${host}:${port}.`);
  });
}
