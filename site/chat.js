const messagesElement = document.getElementById("messages");
const emptyState = document.getElementById("empty-state");
const composer = document.getElementById("composer");
const messageInput = document.getElementById("message-input");
const sendButton = document.getElementById("send-button");
const chatError = document.getElementById("chat-error");
const chatList = document.getElementById("chat-list");
const modelStatus = document.getElementById("model-status");
const STORAGE_KEY = "astra-local-conversations";
const githubPages = location.hostname === "github.io" || location.hostname.endsWith(".github.io");
const configuredApiBase = String(window.ASTRA_API_BASE_URL || "").trim().replace(/\/+$/, "");
const apiBase = configuredApiBase || (
  window.ASTRA_API_BASE_URL_REQUIRED || githubPages
    ? ""
    : `${location.origin}/v1`
);

let conversations = loadConversations();
let activeChatId = "";
let isSending = false;

modelStatus.textContent = apiBase
  ? "A IA está pronta pelo servidor Astra. O histórico fica salvo neste navegador."
  : "O chat precisa do endereço público da API Astra para funcionar neste site.";

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

function appendInlineMarkdown(container, text) {
  const tokenPattern = /(`[^`\n]+`|\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*|_[^_\n]+_|\[[^\]]+\]\(https?:\/\/[^\s)]+\))/g;
  let lastIndex = 0;
  for (const match of text.matchAll(tokenPattern)) {
    container.append(document.createTextNode(text.slice(lastIndex, match.index)));
    const token = match[0];
    if (token.startsWith("`")) {
      const code = document.createElement("code");
      code.textContent = token.slice(1, -1);
      container.append(code);
    } else if (token.startsWith("**") || token.startsWith("__")) {
      const strong = document.createElement("strong");
      strong.textContent = token.slice(2, -2);
      container.append(strong);
    } else if (token.startsWith("*") || token.startsWith("_")) {
      const emphasis = document.createElement("em");
      emphasis.textContent = token.slice(1, -1);
      container.append(emphasis);
    } else {
      const [, label, href] = token.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
      const link = document.createElement("a");
      link.textContent = label;
      link.href = href;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      container.append(link);
    }
    lastIndex = match.index + token.length;
  }
  container.append(document.createTextNode(text.slice(lastIndex)));
}

function renderMarkdown(container, content) {
  const lines = content.replace(/\r\n?/g, "\n").split("\n");
  let paragraph = [];
  let list;
  let codeLines;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    const element = document.createElement("p");
    appendInlineMarkdown(element, paragraph.join(" "));
    container.append(element);
    paragraph = [];
  };
  const closeList = () => {
    list = undefined;
  };

  for (const line of lines) {
    if (codeLines) {
      if (/^\s*```/.test(line)) {
        const pre = document.createElement("pre");
        const code = document.createElement("code");
        code.textContent = codeLines.join("\n");
        pre.append(code);
        container.append(pre);
        codeLines = undefined;
      } else {
        codeLines.push(line);
      }
      continue;
    }
    if (/^\s*```/.test(line)) {
      flushParagraph();
      closeList();
      codeLines = [];
      continue;
    }
    if (!line.trim()) {
      flushParagraph();
      closeList();
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      closeList();
      const element = document.createElement(`h${heading[1].length + 1}`);
      appendInlineMarkdown(element, heading[2]);
      container.append(element);
      continue;
    }

    const item = line.match(/^\s*(?:([-*+])|(\d+)\.)\s+(.+)$/);
    if (item) {
      flushParagraph();
      const tagName = item[2] ? "ol" : "ul";
      if (!list || list.tagName.toLowerCase() !== tagName) {
        closeList();
        list = document.createElement(tagName);
        container.append(list);
      }
      const element = document.createElement("li");
      appendInlineMarkdown(element, item[3]);
      list.append(element);
      continue;
    }
    closeList();
    paragraph.push(line);
  }
  flushParagraph();
  if (codeLines) {
    const pre = document.createElement("pre");
    const code = document.createElement("code");
    code.textContent = codeLines.join("\n");
    pre.append(code);
    container.append(pre);
  }
}

function appendMessage(role, content) {
  emptyState.hidden = true;
  const message = document.createElement("div");
  message.className = `message ${role}`;
  if (role === "assistant") renderMarkdown(message, content);
  else message.textContent = content;
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

async function requestModel(messages) {
  if (!apiBase) {
    throw new Error("Configure ASTRA_API_BASE_URL no GitHub para conectar o chat à API Astra.");
  }
  const context = messages.slice(-10);
  let contextChars = context.reduce((total, message) => total + message.content.length, 0);
  while (context.length > 1 && contextChars > 20_000) {
    contextChars -= context.shift().content.length;
  }
  const response = await fetch(`${apiBase}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: context, stream: false })
  });
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error("A API Astra retornou uma resposta inválida.");
  }
  if (!response.ok) {
    throw new Error(result.error || `A API Astra respondeu ${response.status}.`);
  }
  const reply = result?.choices?.[0]?.message?.content;
  if (typeof reply !== "string" || !reply.trim()) {
    throw new Error("A API Astra não retornou uma resposta de texto.");
  }
  return reply.trim();
}

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
    chatError.textContent = error.message || "A API Astra encontrou um erro desconhecido.";
    modelStatus.textContent = "Não foi possível acessar a IA Astra. Tente novamente.";
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
