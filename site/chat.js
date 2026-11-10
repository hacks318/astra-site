const messagesElement = document.getElementById("messages");
const emptyState = document.getElementById("empty-state");
const composer = document.getElementById("composer");
const messageInput = document.getElementById("message-input");
const sendButton = document.getElementById("send-button");
const chatError = document.getElementById("chat-error");
const chatList = document.getElementById("chat-list");
const modelStatus = document.getElementById("model-status");
const STORAGE_KEY = "astra-local-conversations";

let conversations = loadConversations();
let activeChatId = "";
let isSending = false;
let nextRequestId = 0;
const modelWorker = new Worker("./chat-worker.js", { type: "module" });
const pendingRequests = new Map();

function loadConversations() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(saved) ? saved.filter((chat) =>
      typeof chat.id === "string" &&
      Array.isArray(chat.messages) &&
      chat.messages.every((message) =>
        message && ["user", "assistant"].includes(message.role) && typeof message.content === "string"
      )
    ) : [];
  } catch (error) {
    chatError.textContent = `Não foi possível ler o histórico salvo: ${error.message}`;
    return [];
  }
}

function persistConversations() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
  } catch (error) {
    chatError.textContent = `Não foi possível salvar neste aparelho: ${error.message}`;
  }
}

function renderChatList() {
  chatList.replaceChildren();
  for (const chat of [...conversations].reverse()) {
    const firstMessage = chat.messages.find((message) => message.role === "user");
    if (!firstMessage) continue;
    const button = document.createElement("button");
    button.type = "button";
    button.className = `chat-item${chat.id === activeChatId ? " active" : ""}`;
    button.textContent = firstMessage.content;
    button.title = firstMessage.content;
    button.addEventListener("click", () => selectConversation(chat.id));
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
  emptyState.hidden = messages.length > 0;
  for (const message of messages) appendMessage(message.role, message.content);
}

function selectConversation(chatId) {
  const chat = conversations.find((entry) => entry.id === chatId);
  if (!chat) return;
  activeChatId = chat.id;
  showMessages(chat.messages);
  renderChatList();
}

function updateConversation(messages) {
  const now = Date.now();
  let chat = conversations.find((entry) => entry.id === activeChatId);
  if (!chat) {
    const id = typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${now}-${Math.random().toString(16).slice(2)}`;
    chat = { id, createdAt: now, updatedAt: now, messages: [] };
    conversations.push(chat);
    activeChatId = chat.id;
  }
  chat.messages = messages;
  chat.updatedAt = now;
  persistConversations();
  renderChatList();
}

function requestModel(messages) {
  const requestId = String(++nextRequestId);
  return new Promise((resolve, reject) => {
    pendingRequests.set(requestId, { resolve, reject });
    modelWorker.postMessage({ type: "generate", requestId, messages });
  });
}

modelWorker.addEventListener("message", (event) => {
  const { type, requestId, message, result } = event.data || {};
  if (type === "status") {
    modelStatus.textContent = message;
    return;
  }
  const pending = pendingRequests.get(requestId);
  if (!pending) return;
  pendingRequests.delete(requestId);
  if (type === "result") pending.resolve(result);
  else if (type === "error") pending.reject(new Error(message));
});

modelWorker.addEventListener("error", (event) => {
  chatError.textContent = `A IA local falhou ao iniciar: ${event.message}`;
  modelStatus.textContent = "Não foi possível iniciar a IA local.";
  for (const pending of pendingRequests.values()) {
    pending.reject(new Error(event.message || "Falha ao iniciar o modelo local."));
  }
  pendingRequests.clear();
});

document.getElementById("new-chat").addEventListener("click", () => {
  activeChatId = "";
  showMessages([]);
  chatError.textContent = "";
  messageInput.focus();
  renderChatList();
});

composer.addEventListener("submit", async (event) => {
  event.preventDefault();
  const content = messageInput.value.trim();
  if (!content || isSending) return;

  isSending = true;
  sendButton.disabled = true;
  chatError.textContent = "";
  messageInput.value = "";
  messageInput.style.height = "auto";

  const chat = conversations.find((entry) => entry.id === activeChatId);
  const history = [...(chat?.messages || []), { role: "user", content }];
  appendMessage("user", content);
  try {
    updateConversation(history);
    const reply = await requestModel(history.slice(-8));
    const updatedHistory = [...history, { role: "assistant", content: reply }];
    updateConversation(updatedHistory);
    appendMessage("assistant", reply);
  } catch (error) {
    chatError.textContent = error.message;
    modelStatus.textContent = "A IA local está indisponível. Tente novamente.";
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

showMessages([]);
renderChatList();
