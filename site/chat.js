const authView = document.getElementById("auth-view");
const chatView = document.getElementById("chat-view");
const authForm = document.getElementById("auth-form");
const authError = document.getElementById("auth-error");
const apiUrlInput = document.getElementById("api-url");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const passwordConfirm = document.getElementById("password-confirm");
const confirmWrap = document.getElementById("confirm-wrap");
const authTitle = document.getElementById("auth-title");
const authSubmit = document.getElementById("auth-submit");
const authMode = document.getElementById("auth-mode");
const messagesElement = document.getElementById("messages");
const emptyState = document.getElementById("empty-state");
const composer = document.getElementById("composer");
const messageInput = document.getElementById("message-input");
const sendButton = document.getElementById("send-button");
const chatError = document.getElementById("chat-error");
const chatList = document.getElementById("chat-list");

let isRegistering = false;
let isSending = false;
let token = localStorage.getItem("astra-account-token") || "";
let apiBase = localStorage.getItem("astra-account-api") || "";
let activeChatId = "";
let history = [];
let currentUser = null;

apiUrlInput.value = apiBase;

function normalizedApiBase(value) {
  const parsed = new URL(value.trim());
  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    (parsed.protocol === "http:" && !["localhost", "127.0.0.1", "::1"].includes(parsed.hostname))
  ) {
    throw new Error("Use HTTPS para a API publicada ou HTTP somente em localhost.");
  }
  return parsed.href.replace(/\/+$/, "");
}

async function apiRequest(route, { method = "GET", body, authenticated = true } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (authenticated && token) headers.Authorization = `Bearer ${token}`;
  let response;
  try {
    response = await fetch(`${apiBase}${route}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch {
    throw new Error("Não foi possível conectar à API. Confira o endereço, o HTTPS e o CORS do servidor.");
  }
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error("A API retornou uma resposta inválida.");
  }
  if (!response.ok) throw new Error(result.error || `A API respondeu ${response.status}.`);
  return result;
}

function setAuthMode(registering) {
  isRegistering = registering;
  authTitle.textContent = registering ? "Crie sua conta" : "Entre na sua conta";
  authSubmit.textContent = registering ? "Criar conta" : "Entrar";
  authMode.textContent = registering
    ? "Já tem conta? Entrar"
    : "Ainda não tem conta? Criar conta";
  confirmWrap.hidden = !registering;
  passwordConfirm.required = registering;
  passwordInput.autocomplete = registering ? "new-password" : "current-password";
  authError.textContent = "";
}

async function renderChatList() {
  const { chats } = await apiRequest("/chats");
  chatList.replaceChildren();
  for (const chat of chats) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `chat-item${chat.id === activeChatId ? " active" : ""}`;
    button.textContent = chat.title;
    button.title = chat.title;
    button.addEventListener("click", () => loadChat(chat.id));
    chatList.append(button);
  }
}

function appendMessage(role, content) {
  emptyState.hidden = true;
  const message = document.createElement("div");
  message.className = `message ${role}`;
  message.textContent = content;
  messagesElement.append(message);
  messagesElement.scrollTop = messagesElement.scrollHeight;
}

function showMessages(messages) {
  messagesElement.replaceChildren(emptyState);
  history = messages.map(({ role, content }) => ({ role, content }));
  emptyState.hidden = history.length > 0;
  for (const message of history) appendMessage(message.role, message.content);
}

async function loadChat(chatId) {
  chatError.textContent = "";
  try {
    const { chat } = await apiRequest(`/chats/${chatId}`);
    activeChatId = chat.id;
    showMessages(chat.messages);
    await renderChatList();
  } catch (error) {
    chatError.textContent = error.message;
  }
}

async function showAccount() {
  authView.hidden = true;
  chatView.hidden = false;
  document.getElementById("account-email").textContent = currentUser.email;
  await renderChatList();
  if (!activeChatId) showMessages([]);
}

authMode.addEventListener("click", () => setAuthMode(!isRegistering));

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  authError.textContent = "";
  authSubmit.disabled = true;
  try {
    apiBase = normalizedApiBase(apiUrlInput.value);
    apiUrlInput.value = apiBase;
    localStorage.setItem("astra-account-api", apiBase);
    const email = emailInput.value.trim().toLowerCase();
    const password = passwordInput.value;
    if (isRegistering && password !== passwordConfirm.value) {
      throw new Error("As senhas não conferem.");
    }
    const route = isRegistering ? "/auth/register" : "/auth/login";
    const result = await apiRequest(route, {
      method: "POST",
      body: { email, password },
      authenticated: false
    });
    token = result.token;
    currentUser = result.user;
    localStorage.setItem("astra-account-token", token);
    passwordInput.value = "";
    passwordConfirm.value = "";
    activeChatId = "";
    await showAccount();
  } catch (error) {
    authError.textContent = error.message;
  } finally {
    authSubmit.disabled = false;
  }
});

document.getElementById("new-chat").addEventListener("click", () => {
  activeChatId = "";
  showMessages([]);
  chatError.textContent = "";
  messageInput.focus();
  renderChatList().catch((error) => {
    chatError.textContent = error.message;
  });
});

async function saveCurrentChat() {
  if (!activeChatId) {
    const result = await apiRequest("/chats", { method: "POST", body: {} });
    activeChatId = result.chat.id;
  }
  await apiRequest(`/chats/${activeChatId}`, {
    method: "PUT",
    body: { messages: history }
  });
  await renderChatList();
}

composer.addEventListener("submit", async (event) => {
  event.preventDefault();
  const content = messageInput.value.trim();
  if (!content || isSending) return;
  isSending = true;
  sendButton.disabled = true;
  chatError.textContent = "";
  messageInput.value = "";
  messageInput.style.height = "auto";
  history.push({ role: "user", content });
  appendMessage("user", content);
  try {
    await saveCurrentChat();
    const { choices } = await apiRequest("/chat/completions", {
      method: "POST",
      body: {
        messages: history.slice(-10),
        educationMode: false
      }
    });
    const reply = choices?.[0]?.message?.content;
    if (typeof reply !== "string" || !reply.trim()) {
      throw new Error("A API não retornou uma resposta de texto.");
    }
    history.push({ role: "assistant", content: reply.trim() });
    appendMessage("assistant", reply.trim());
    await saveCurrentChat();
  } catch (error) {
    chatError.textContent = error.message;
    try {
      await saveCurrentChat();
    } catch (saveError) {
      chatError.textContent += ` Não foi possível sincronizar: ${saveError.message}`;
    }
  } finally {
    isSending = false;
    sendButton.disabled = false;
    messageInput.focus();
  }
});

messageInput.addEventListener("input", () => {
  messageInput.style.height = "auto";
  messageInput.style.height = `${Math.min(messageInput.scrollHeight, 130)}px`;
});

messageInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    composer.requestSubmit();
  }
});

document.getElementById("logout").addEventListener("click", async () => {
  try {
    await apiRequest("/auth/logout", { method: "POST", body: {} });
  } catch (error) {
    chatError.textContent = error.message;
    return;
  }
  token = "";
  currentUser = null;
  activeChatId = "";
  history = [];
  localStorage.removeItem("astra-account-token");
  chatView.hidden = true;
  authView.hidden = false;
  setAuthMode(false);
});

async function restoreSession() {
  if (!token || !apiBase) return;
  try {
    apiBase = normalizedApiBase(apiBase);
    apiUrlInput.value = apiBase;
    currentUser = (await apiRequest("/auth/me")).user;
    await showAccount();
  } catch (error) {
    authError.textContent = error.message;
    if (error.message.includes("Entre na sua conta")) {
      token = "";
      localStorage.removeItem("astra-account-token");
    }
  }
}

restoreSession();
