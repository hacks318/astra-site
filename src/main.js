const { app, BrowserWindow, ipcMain, safeStorage, session } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { discoverLGTVs, isPrivateIPv4, LGTVSession } = require("./lg-tv");

const settingsPath = () => path.join(app.getPath("userData"), "settings.json");
const discoveredTVs = new Map();
const tvSessions = new Map();
let ollamaStartError;
let ollamaStartup;
let mainWindow;
let microphoneConsentGranted = false;

ipcMain.handle("microphone:consent", (event) => {
  if (
    event.sender !== mainWindow?.webContents ||
    !event.senderFrame?.isMainFrame
  ) {
    throw new Error("Não foi possível validar a solicitação de microfone.");
  }
  microphoneConsentGranted = true;
});

ipcMain.handle("microphone:revoke-consent", (event) => {
  if (
    event.sender !== mainWindow?.webContents ||
    !event.senderFrame?.isMainFrame
  ) {
    throw new Error("Não foi possível validar a solicitação de microfone.");
  }
  microphoneConsentGranted = false;
});

function isMainAppFrame(webContents, details) {
  return (
    webContents === mainWindow?.webContents &&
    details.isMainFrame &&
    details.requestingUrl === webContents.getURL()
  );
}

function requireMainAppEvent(event) {
  if (!mainWindow || event.sender !== mainWindow.webContents) {
    throw new Error("Solicitação de TV não autorizada.");
  }
}

function readSettings() {
  try {
    return JSON.parse(fs.readFileSync(settingsPath(), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw new Error(`Não foi possível ler as configurações: ${error.message}`);
  }
}

function writeSettings(settings) {
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2), "utf8");
}

function getPublicTVs(settings = readSettings()) {
  return (settings.tvDevices || []).map(({ host, name }) => ({ host, name }));
}

function saveTVClientKey(host, name, clientKey) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("A proteção de credenciais do Windows não está disponível.");
  }
  const settings = readSettings();
  const devices = settings.tvDevices || [];
  const device = {
    host,
    name,
    encryptedClientKey: safeStorage.encryptString(clientKey).toString("base64")
  };
  settings.tvDevices = [...devices.filter((entry) => entry.host !== host), device];
  settings.activeTVHost = host;
  writeSettings(settings);
}

function getPairedTV(host) {
  if (!isPrivateIPv4(host)) throw new Error("O endereço da TV não é válido na rede local.");
  const device = (readSettings().tvDevices || []).find((entry) => entry.host === host);
  if (!device?.encryptedClientKey) {
    throw new Error("Pareie a TV LG antes de enviar comandos.");
  }
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("A proteção de credenciais do Windows não está disponível.");
  }
  return {
    ...device,
    clientKey: safeStorage.decryptString(
      Buffer.from(device.encryptedClientKey, "base64")
    )
  };
}

async function getTVSession(host) {
  const pairedTV = getPairedTV(host);
  const existing = tvSessions.get(host);
  if (existing?.connected) return existing;
  if (existing) await existing.disconnect();

  const session = new LGTVSession(
    host,
    pairedTV.clientKey,
    (clientKey) => saveTVClientKey(host, pairedTV.name, clientKey),
    () => {
      mainWindow?.webContents.send("tv:status", {
        host,
        message: "Confirme a solicitação de conexão na tela da TV."
      });
    }
  );
  tvSessions.set(host, session);
  try {
    return await session.connect();
  } catch (error) {
    tvSessions.delete(host);
    throw error;
  }
}

async function getTVApps(session) {
  const result = await session.request(
    "ssap://com.webos.applicationManager/listLaunchPoints"
  );
  const launchPoints = Array.isArray(result)
    ? result
    : Array.isArray(result.launchPoints)
      ? result.launchPoints
      : [];
  return launchPoints
    .filter(
      (appInfo) =>
        typeof appInfo.id === "string" && typeof appInfo.title === "string"
    )
    .map(({ id, title }) => ({ id, title }));
}

ipcMain.handle("tv:get", (event) => {
  requireMainAppEvent(event);
  const settings = readSettings();
  return {
    devices: getPublicTVs(settings),
    activeHost: settings.activeTVHost || ""
  };
});

ipcMain.handle("tv:discover", async (event) => {
  requireMainAppEvent(event);
  const result = await discoverLGTVs();
  discoveredTVs.clear();
  for (const device of result.devices) discoveredTVs.set(device.host, device);
  return result;
});

ipcMain.handle("tv:connect", async (event, input) => {
  requireMainAppEvent(event);
  const host = String(input.host || "").trim();
  if (!isPrivateIPv4(host)) throw new Error("Informe o IPv4 privado da TV na rede local.");
  const discovered = discoveredTVs.get(host) || { host, name: `LG webOS (${host})` };
  const stored = (readSettings().tvDevices || []).find((device) => device.host === host);
  if (stored?.encryptedClientKey && !safeStorage.isEncryptionAvailable()) {
    throw new Error("A proteção de credenciais do Windows não está disponível.");
  }
  const clientKey =
    stored?.encryptedClientKey && safeStorage.isEncryptionAvailable()
      ? safeStorage.decryptString(
          Buffer.from(stored.encryptedClientKey, "base64")
        )
      : "";
  const previous = tvSessions.get(host);
  if (previous) await previous.disconnect();
  const tv = new LGTVSession(
    host,
    clientKey,
    (key) => saveTVClientKey(host, discovered.name, key),
    () => {
      event.sender.send("tv:status", {
        host,
        message: "Pedido enviado. Aprove a conexão na tela da TV LG."
      });
    }
  );
  tvSessions.set(host, tv);
  try {
    await tv.connect();
    if (!tv.clientKey) throw new Error("A TV não concluiu o pareamento.");
    return { host, name: discovered.name };
  } catch (error) {
    tvSessions.delete(host);
    await tv.disconnect();
    throw error;
  }
});

ipcMain.handle("tv:apps", async (event, input) => {
  requireMainAppEvent(event);
  const tv = await getTVSession(String(input.host || ""));
  return getTVApps(tv);
});

ipcMain.handle("tv:select", (event, input) => {
  requireMainAppEvent(event);
  const host = String(input.host || "");
  getPairedTV(host);
  const settings = readSettings();
  settings.activeTVHost = host;
  writeSettings(settings);
});

ipcMain.handle("tv:action", async (event, input) => {
  requireMainAppEvent(event);
  const host = String(input.host || "");
  const tv = await getTVSession(host);
  const action = String(input.action || "");

  if (action === "open-app") {
    const appId = String(input.appId || "");
    const apps = await getTVApps(tv);
    if (!apps.some((entry) => entry.id === appId)) {
      throw new Error("Escolha um aplicativo instalado na TV.");
    }
    await tv.request("ssap://com.webos.applicationManager/launch", { id: appId });
    return { message: "Aplicativo aberto na TV." };
  }

  if (action === "open-app-name") {
    const requestedName = String(input.name || "").trim().toLocaleLowerCase("pt-BR");
    if (!requestedName || requestedName.length > 100) {
      throw new Error("Informe o nome de um aplicativo instalado.");
    }
    const apps = await getTVApps(tv);
    const appInfo = apps.find(
      (entry) =>
        entry.title.toLocaleLowerCase("pt-BR") === requestedName ||
        entry.id.toLocaleLowerCase("pt-BR") === requestedName
    );
    if (!appInfo) {
      throw new Error(`Não encontrei “${requestedName}” entre os apps instalados na TV.`);
    }
    await tv.request("ssap://com.webos.applicationManager/launch", {
      id: appInfo.id
    });
    return { message: `${appInfo.title} aberto na TV.` };
  }

  if (action === "spotify-open") {
    const apps = await getTVApps(tv);
    const spotify = apps.find(
      (entry) =>
        entry.title.toLowerCase().includes("spotify") ||
        entry.id.toLowerCase().includes("spotify")
    );
    if (!spotify) {
      throw new Error("Não encontrei o Spotify entre os aplicativos instalados na TV.");
    }
    await tv.request("ssap://com.webos.applicationManager/launch", {
      id: spotify.id
    });
    return { message: "Spotify aberto na TV." };
  }

  if (action === "spotify-play") {
    const apps = await getTVApps(tv);
    const spotify = apps.find(
      (entry) =>
        entry.title.toLowerCase().includes("spotify") ||
        entry.id.toLowerCase().includes("spotify")
    );
    if (!spotify) {
      throw new Error("Não encontrei o Spotify entre os aplicativos instalados na TV.");
    }
    await tv.request("ssap://com.webos.applicationManager/launch", {
      id: spotify.id
    });
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await tv.request("ssap://media.controls/play");
    return {
      message:
        "Abri o Spotify e enviei play. Para escolher uma música específica, abra a busca do Spotify na TV e envie o nome pelo campo de texto."
    };
  }

  if (action === "play" || action === "pause") {
    await tv.request(`ssap://media.controls/${action}`);
    return { message: action === "play" ? "Reprodução iniciada." : "Reprodução pausada." };
  }

  if (action === "type-text") {
    const text = String(input.text || "").trim();
    if (!text || text.length > 200 || /[\u0000-\u001f\u007f]/.test(text)) {
      throw new Error("Digite um texto de até 200 caracteres.");
    }
    await tv.request("ssap://com.webos.service.ime/insertText", {
      text,
      replace: 0
    });
    return { message: "Texto enviado ao campo selecionado na TV." };
  }

  if (action === "enter") {
    await tv.request("ssap://com.webos.service.ime/sendEnterKey");
    return { message: "Confirmei o texto no campo selecionado da TV." };
  }

  throw new Error("Ação de TV não permitida.");
});

function getApiKey(settings) {
  if (!settings.encryptedApiKey) return "";
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("A proteção de credenciais do Windows não está disponível.");
  }
  return safeStorage.decryptString(Buffer.from(settings.encryptedApiKey, "base64"));
}

function getPublicSettings(settings) {
  const provider = settings.provider || "ollama";
  const settingsMatchProvider = settings.provider === provider;
  return {
    provider,
    endpoint:
      (settingsMatchProvider && settings.endpoint) ||
      (provider === "ollama"
        ? "http://127.0.0.1:11434"
        : "https://api.openai.com/v1"),
    model:
      (settingsMatchProvider && settings.model) ||
      (provider === "ollama" ? "qwen2.5:3b" : "gpt-4o-mini"),
    hasApiKey: Boolean(settings.encryptedApiKey)
  };
}

function validateLocalOllama(endpoint) {
  let parsedEndpoint;
  try {
    parsedEndpoint = new URL(endpoint);
  } catch {
    throw new Error("Informe uma URL válida para o Ollama.");
  }
  if (
    !["http:", "https:"].includes(parsedEndpoint.protocol) ||
    !["127.0.0.1", "localhost", "::1"].includes(parsedEndpoint.hostname)
  ) {
    throw new Error("O Ollama precisa estar neste computador.");
  }
  return parsedEndpoint.origin;
}

async function ensureOllamaAvailable(endpoint) {
  if (ollamaStartup) return ollamaStartup;

  ollamaStartup = startOllamaIfNeeded(endpoint);
  try {
    return await ollamaStartup;
  } finally {
    ollamaStartup = undefined;
  }
}

async function startOllamaIfNeeded(endpoint) {
  const tagsUrl = `${endpoint}/api/tags`;
  try {
    const response = await fetch(tagsUrl, { signal: AbortSignal.timeout(2000) });
    if (response.ok) return response;
  } catch {}

  const executable = process.env.LOCALAPPDATA
    ? path.join(process.env.LOCALAPPDATA, "Programs", "Ollama", "ollama.exe")
    : "";
  const command = executable && fs.existsSync(executable) ? executable : "ollama";
  const child = spawn(command, ["serve"], {
    detached: true,
    stdio: "ignore",
    windowsHide: true
  });
  child.once("error", (error) => {
    ollamaStartError = error;
  });
  child.unref();

  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    try {
      const response = await fetch(tagsUrl, {
        signal: AbortSignal.timeout(2000)
      });
      if (response.ok) {
        ollamaStartError = undefined;
        return response;
      }
    } catch {}
  }

  if (ollamaStartError) {
    throw new Error(
      "Não consegui iniciar o Ollama. Confira se ele está instalado ou aberto no Windows."
    );
  }
  throw new Error(
    "O Ollama não respondeu. Abra o Ollama no Windows e tente novamente."
  );
}

async function warmLocalModel(config) {
  await ensureOllamaAvailable(validateLocalOllama(config.endpoint));
  const response = await fetch(`${config.endpoint}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: config.model,
      messages: [{ role: "user", content: "Responda apenas: pronta." }],
      stream: false,
      keep_alive: "10m",
      options: {
        num_ctx: 4096,
        num_predict: 2,
        temperature: 0
      }
    }),
    signal: AbortSignal.timeout(120000)
  });
  if (!response.ok) {
    const details = (await response.text()).slice(0, 300);
    throw new Error(`Não foi possível preparar o modelo local: ${details}`);
  }
}

ipcMain.handle("ollama:test", async (_event, input) => {
  const endpoint = validateLocalOllama(String(input.endpoint || "").trim());
  const model = String(input.model || "").trim();
  if (!model) throw new Error("Informe o nome do modelo.");

  const response = await ensureOllamaAvailable(endpoint);

  const result = await response.json();
  const models = Array.isArray(result.models) ? result.models : [];
  if (!models.some((entry) => entry.name === model || entry.model === model)) {
    throw new Error(
      `O modelo "${model}" não está instalado no Ollama. Instale esse modelo no Ollama ou informe um modelo instalado.`
    );
  }
  return { connected: true, model };
});

ipcMain.handle("settings:get", () => {
  return getPublicSettings(readSettings());
});

function getAccountSettings(settings = readSettings()) {
  if (!settings.account || !settings.account.encryptedToken) return null;
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("A proteção da conta no Windows não está disponível.");
  }
  return {
    apiBase: settings.account.apiBase,
    email: settings.account.email,
    token: safeStorage.decryptString(Buffer.from(settings.account.encryptedToken, "base64"))
  };
}

function validateAccountApiBase(value) {
  let parsed;
  try {
    parsed = new URL(String(value || "").trim());
  } catch {
    throw new Error("Informe o endereço da API Astra.");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("O endereço da API precisa usar HTTP ou HTTPS.");
  }
  if (parsed.protocol === "http:" && !["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)) {
    throw new Error("Para uma API publicada, use HTTPS.");
  }
  return parsed.href.replace(/\/+$/, "");
}

async function accountRequest(account, route, options = {}) {
  let response;
  try {
    response = await fetch(`${account.apiBase}${route}`, {
      method: options.method || "GET",
      headers: {
        Authorization: `Bearer ${account.token}`,
        ...(options.body === undefined ? {} : { "Content-Type": "application/json" })
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: AbortSignal.timeout(30_000)
    });
  } catch (error) {
    throw new Error(`Não foi possível conectar à API Astra: ${error.message}`);
  }
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error("A API Astra retornou uma resposta inválida.");
  }
  if (!response.ok) throw new Error(result.error || `A API Astra respondeu ${response.status}.`);
  return result;
}

ipcMain.handle("account:get", () => {
  const account = getAccountSettings();
  return account ? { email: account.email } : null;
});

ipcMain.handle("account:authenticate", async (event, input) => {
  requireMainAppEvent(event);
  const apiBase = validateAccountApiBase(input.apiBase);
  const email = String(input.email || "").trim().toLowerCase();
  const password = String(input.password || "");
  const route = input.registering === true ? "/auth/register" : "/auth/login";
  let response;
  try {
    response = await fetch(`${apiBase}${route}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
      signal: AbortSignal.timeout(30_000)
    });
  } catch (error) {
    throw new Error(`Não foi possível conectar à API Astra: ${error.message}`);
  }
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error("A API Astra retornou uma resposta inválida.");
  }
  if (!response.ok) throw new Error(result.error || `A API Astra respondeu ${response.status}.`);
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("A proteção da conta no Windows não está disponível.");
  }
  const settings = readSettings();
  settings.account = {
    apiBase,
    email: result.user.email,
    encryptedToken: safeStorage.encryptString(result.token).toString("base64")
  };
  writeSettings(settings);
  return { email: result.user.email };
});

ipcMain.handle("account:logout", (event) => {
  requireMainAppEvent(event);
  const settings = readSettings();
  delete settings.account;
  writeSettings(settings);
  return true;
});

ipcMain.handle("account:list", async (event) => {
  requireMainAppEvent(event);
  const account = getAccountSettings();
  if (!account) throw new Error("Entre na sua conta para acessar as conversas.");
  return (await accountRequest(account, "/chats")).chats;
});

ipcMain.handle("account:load-chat", async (event, chatId) => {
  requireMainAppEvent(event);
  const account = getAccountSettings();
  if (!account) throw new Error("Entre na sua conta para acessar as conversas.");
  return (await accountRequest(account, `/chats/${encodeURIComponent(String(chatId))}`)).chat;
});

ipcMain.handle("account:save-chat", async (event, input) => {
  requireMainAppEvent(event);
  const account = getAccountSettings();
  if (!account) throw new Error("Entre na sua conta para salvar as conversas.");
  let chatId = String(input.chatId || "");
  if (!chatId) {
    const result = await accountRequest(account, "/chats", { method: "POST", body: {} });
    chatId = result.chat.id;
  }
  const result = await accountRequest(account, `/chats/${encodeURIComponent(chatId)}`, {
    method: "PUT",
    body: { messages: input.messages }
  });
  return result.chat;
});

ipcMain.handle("settings:save", (_event, input) => {
  const current = readSettings();
  const provider = input.provider === "openai" ? "openai" : "ollama";
  const endpoint = String(input.endpoint || "").trim().replace(/\/+$/, "");
  const model = String(input.model || "").trim();

  let parsedEndpoint;
  try {
    parsedEndpoint = new URL(endpoint);
  } catch {
    throw new Error("Informe uma URL válida para o servidor.");
  }
  if (!["http:", "https:"].includes(parsedEndpoint.protocol)) {
    throw new Error("Informe uma URL válida para a API.");
  }
  if (
    provider === "ollama" &&
    !["127.0.0.1", "localhost", "::1"].includes(parsedEndpoint.hostname)
  ) {
    throw new Error("Para usar o Ollama, o servidor precisa estar neste computador.");
  }
  if (!model) throw new Error("Informe o nome do modelo.");

  const settings = { ...current, provider, endpoint, model };
  if (provider === "openai" && input.apiKey) {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error("A proteção de credenciais do Windows não está disponível.");
    }
    settings.encryptedApiKey = safeStorage
      .encryptString(String(input.apiKey))
      .toString("base64");
  }
  if (input.clearApiKey) delete settings.encryptedApiKey;
  writeSettings(settings);

  return getPublicSettings(settings);
});

ipcMain.handle("chat:send", async (_event, input) => {
  const settings = readSettings();
  const config = getPublicSettings(settings);
  const provider = config.provider;
  const apiKey = provider === "openai" ? getApiKey(settings) : "";
  if (provider === "openai" && !apiKey) {
    throw new Error("Configure sua chave de API nas configurações.");
  }

  const messages = Array.isArray(input.messages) ? input.messages : [];
  if (!messages.length || messages.length > 40) {
    throw new Error("A conversa está vazia ou contém mensagens demais.");
  }

  const systemMessage = {
    role: "system",
    content:
      [
        "Você é Astra, uma assistente de IA original, prestativa e acolhedora. Responda em português brasileiro, salvo se pedirem outro idioma. Vá direto ao ponto e use respostas concisas. Quando houver etapas ou vários itens, organize em lista curta. Não invente detalhes.",
        input.educationMode === true
          ? "O Modo Educação está ativo. Ajude professores e alunos a aprender segurança digital defensiva com linguagem adequada à idade e exemplos fictícios. Priorize reconhecer phishing e golpes, proteger contas e dispositivos, privacidade, autenticação em duas etapas e como pedir ajuda a um adulto ou à equipe de TI. Para professores, ofereça objetivos, planos de aula, atividades seguras e quizzes com gabarito. Nunca peça senhas, códigos de verificação, dados pessoais, mensagens reais com informações sensíveis ou que alguém abra um link suspeito. Não forneça instruções, código ou passos para invadir contas ou sistemas, explorar vulnerabilidades, criar malware, roubar credenciais, contornar proteções ou evitar detecção. Se pedirem isso, recuse brevemente e redirecione para prevenção, conceitos gerais ou um exercício fictício e seguro."
          : ""
      ]
        .filter(Boolean)
        .join("\n\n")
  };
  const conversation = [
    systemMessage,
    ...messages.slice(-10).map(({ role, content }) => ({
      role: role === "assistant" ? "assistant" : "user",
      content: String(content).slice(0, 6000)
    }))
  ];
  const requestId = String(input.requestId || "");
  if (!/^[\w-]{1,80}$/.test(requestId)) {
    throw new Error("Identificador de conversa inválido.");
  }
  const sendChunk = (chunk) => {
    if (chunk) _event.sender.send("chat:chunk", { requestId, chunk });
  };

  let response;
  try {
    if (provider === "ollama") {
      await ensureOllamaAvailable(config.endpoint);
      response = await fetch(`${config.endpoint}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: config.model,
          messages: conversation,
          stream: true,
          keep_alive: "10m",
          options: {
            num_ctx: 4096,
            num_predict: 220,
            temperature: 0.5
          }
        }),
        signal: AbortSignal.timeout(120000)
      });
    } else {
      response = await fetch(`${config.endpoint}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: config.model,
          messages: conversation,
          stream: true
        }),
        signal: AbortSignal.timeout(60000)
      });
    }
  } catch (error) {
    if (provider === "ollama") {
      throw error;
    }
    throw new Error(`Não consegui conectar à API: ${error.message}`);
  }

  if (!response.ok) {
    const details = (await response.text()).slice(0, 500);
    if (provider === "ollama" && response.status === 404) {
      throw new Error(
        `O modelo "${config.model}" não foi encontrado no Ollama. Confira o nome do modelo nas configurações.`
      );
    }
    throw new Error(`A API respondeu ${response.status}: ${details}`);
  }

  if (!response.body) {
    throw new Error("A API não iniciou a resposta em fluxo.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let reply = "";

  function consumeLine(line) {
    const value = line.trim();
    if (!value) return;
    let data = value;
    if (provider === "openai") {
      if (!value.startsWith("data:")) return;
      data = value.slice(5).trim();
      if (!data || data === "[DONE]") return;
    }

    let packet;
    try {
      packet = JSON.parse(data);
    } catch {
      throw new Error("A API retornou um bloco de resposta inválido.");
    }
    const token =
      provider === "ollama"
        ? packet.message?.content
        : packet.choices?.[0]?.delta?.content;
    if (typeof token === "string" && token) {
      reply += token;
      sendChunk(token);
    }
    if (packet.error) throw new Error(String(packet.error));
  }

  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";
      for (const line of lines) consumeLine(line);
      if (done) break;
    }
    if (buffer.trim()) consumeLine(buffer);
  } finally {
    reader.releaseLock();
  }

  if (!reply.trim()) {
    throw new Error("A API não retornou uma resposta de texto.");
  }
  return reply.trim();
});

function createWindow() {
  microphoneConsentGranted = false;
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 760,
    minHeight: 620,
    backgroundColor: "#080a12",
    title: "Astra",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = undefined;
    microphoneConsentGranted = false;
  });
  mainWindow.loadFile(path.join(__dirname, "index.html"));
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionCheckHandler(
    (webContents, permission, _origin, details) =>
      permission === "media" &&
      details.mediaType === "audio" &&
      microphoneConsentGranted &&
      isMainAppFrame(webContents, details)
  );
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const requestsAudioOnly =
      permission === "media" &&
      details.mediaTypes?.includes("audio") &&
      !details.mediaTypes.includes("video");
    callback(
      isMainAppFrame(webContents, details) &&
      microphoneConsentGranted &&
      requestsAudioOnly
    );
  });
  createWindow();
  const config = getPublicSettings(readSettings());
  if (config.provider === "ollama") {
    warmLocalModel(config).catch((error) => {
      console.warn(`A preparação da IA local falhou: ${error.message}`);
    });
  }
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
