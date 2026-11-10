const conversation = document.getElementById("conversation");
const welcome = document.getElementById("welcome");
const messagesElement = document.getElementById("messages");
const input = document.getElementById("message-input");
const composer = document.getElementById("composer");
const voiceButton = document.getElementById("voice-button");
const orb = document.getElementById("orb-wrap");
const orbCanvas = document.getElementById("orb-lines");
const connectionLabel = document.getElementById("connection-label");
const educationToggle = document.getElementById("education-toggle");
const educationToggleLabel = document.getElementById("education-toggle-label");
const welcomeEyebrow = document.getElementById("welcome-eyebrow");
const welcomeTitle = document.getElementById("welcome-title");
const welcomeCopy = document.getElementById("welcome-copy");
const modal = document.getElementById("settings-modal");
const settingsForm = document.getElementById("settings-form");
const settingsError = document.getElementById("settings-error");
const connectionTest = document.getElementById("connection-test");
const testConnectionButton = document.getElementById("test-connection");
const providerSelect = document.getElementById("provider");
const voicePermissionModal = document.getElementById("voice-permission-modal");
const voicePermissionError = document.getElementById("voice-permission-error");
const allowVoicePermissionButton = document.getElementById("allow-voice-permission");
const tvModal = document.getElementById("tv-modal");
const tvError = document.getElementById("tv-error");
const tvStatus = document.getElementById("tv-status");
const tvDevices = document.getElementById("tv-devices");
const tvControls = document.getElementById("tv-controls");
const tvSelection = document.getElementById("tv-selected");
const tvAppsSelect = document.getElementById("tv-apps");
const accountModal = document.getElementById("account-modal");
const accountForm = document.getElementById("account-form");
const accountError = document.getElementById("account-error");
const accountSubmit = document.getElementById("account-submit");
const accountModeButton = document.getElementById("account-mode");
const accountLabel = document.getElementById("account-label");
const accountHistory = document.getElementById("account-history");
const history = [];
let activeAccountChatId = "";
let accountRegistering = false;
let pairedTVs = [];
let pairedTVApps = [];
let activeTVHost = "";
let educationMode = localStorage.getItem("astra-education-mode") === "true";

function setEducationMode(enabled) {
  educationMode = enabled;
  document.body.dataset.educationMode = String(enabled);
  educationToggle.setAttribute("aria-pressed", String(enabled));
  educationToggleLabel.textContent = enabled
    ? "Modo Educação ativo"
    : "Modo Educação";
  welcomeEyebrow.textContent = enabled
    ? "APRENDER A SE PROTEGER"
    : "SUA ASSISTENTE, DO SEU JEITO";
  welcomeTitle.innerHTML = enabled
    ? "Segurança digital<br /><span>sem mistério.</span>"
    : "Oi, eu sou a <span>Astra.</span>";
  welcomeCopy.innerHTML = enabled
    ? "Aprenda a reconhecer golpes, proteger suas contas<br />e ensinar segurança digital com responsabilidade."
    : "Estou aqui para conversar, ajudar com ideias<br />ou simplesmente fazer companhia.";
  localStorage.setItem("astra-education-mode", String(enabled));
}

setEducationMode(educationMode);
educationToggle.addEventListener("click", () => {
  setEducationMode(!educationMode);
});

window.astra.onTVStatus((status) => {
  if (status.host === (tvSelection.value || activeTVHost)) {
    setTVStatus(status.message);
  }
});

window.astra
  .getTVs()
  .then((state) => {
    pairedTVs = state.devices;
    activeTVHost = state.activeHost || pairedTVs[0]?.host || "";
  })
  .catch((error) => {
    console.error(`Não foi possível carregar as TVs pareadas: ${error.message}`);
  });
let recognition;
let microphoneAllowed = false;
let microphoneRequestPending = false;
let isSending = false;
let previousProvider = "ollama";
let animationFrame;
let lastOrbFrame = 0;

const orbContext = orbCanvas.getContext("2d", { alpha: true });
const randomGenerator = (() => {
  let seed = 0x41535452;
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
})();
const orbitLines = Array.from({ length: 2600 }, () => ({
  angle: randomGenerator() * Math.PI * 2,
  radius: randomGenerator(),
  depth: randomGenerator() * 2 - 1,
  phase: randomGenerator() * Math.PI * 2,
  speed: (randomGenerator() - 0.5) * 0.52,
  length: 1 + randomGenerator() * 4.5,
  hue: Math.floor(randomGenerator() * 3)
}));
const energyRibbons = Array.from({ length: 14 }, () => ({
  phase: randomGenerator() * Math.PI * 2,
  speed: 0.12 + randomGenerator() * 0.28,
  direction: randomGenerator() > 0.5 ? 1 : -1
}));

function drawOrbit(timestamp = 0) {
  animationFrame = undefined;
  if (document.hidden || !orbCanvas.isConnected) return;
  if (timestamp - lastOrbFrame < 32) {
    animationFrame = requestAnimationFrame(drawOrbit);
    return;
  }
  lastOrbFrame = timestamp;

  const bounds = orbCanvas.getBoundingClientRect();
  if (!bounds.width || !bounds.height) {
    animationFrame = requestAnimationFrame(drawOrbit);
    return;
  }
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.35);
  const width = Math.round(bounds.width * pixelRatio);
  const height = Math.round(bounds.height * pixelRatio);
  if (orbCanvas.width !== width || orbCanvas.height !== height) {
    orbCanvas.width = width;
    orbCanvas.height = height;
  }

  const context = orbContext;
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, bounds.width, bounds.height);

  const size = Math.min(bounds.width, bounds.height);
  const centerX = bounds.width / 2;
  const centerY = bounds.height / 2;
  const coreRadius = size * 0.2;
  const outerRadius = size * 0.48;
  const time = timestamp / 1000;
  const speaking = orb.dataset.state === "speaking";
  const listening = orb.dataset.state === "listening";
  const hue = speaking ? 202 : listening ? 273 : 263;
  const hueOffsets = [-20, 0, 18];
  const lineBuckets = [[], [], []];
  const glow = context.createRadialGradient(
    centerX,
    centerY,
    coreRadius * 0.45,
    centerX,
    centerY,
    outerRadius
  );
  glow.addColorStop(0, `hsla(${hue}, 100%, 78%, 0.16)`);
  glow.addColorStop(0.46, `hsla(${hue}, 100%, 64%, 0.08)`);
  glow.addColorStop(1, `hsla(${hue}, 100%, 55%, 0)`);
  context.fillStyle = glow;
  context.fillRect(0, 0, bounds.width, bounds.height);

  for (const line of orbitLines) {
    const angle = line.angle + time * line.speed * (listening ? 1.65 : 1);
    const depth = Math.sin(angle + line.phase) * 0.72 + line.depth * 0.28;
    const radius = coreRadius + 5 + line.radius * (outerRadius - coreRadius - 5);
    const perspective = 1 + depth * 0.14;
    const x = centerX + Math.cos(angle) * radius * perspective;
    const y = centerY + Math.sin(angle) * radius * 0.58 * perspective;
    const tangentX = -Math.sin(angle) * line.length;
    const tangentY = Math.cos(angle) * line.length * 0.58;
    const layer = depth < -0.18 ? 0 : depth > 0.32 ? 2 : 1;
    const points = lineBuckets[layer];
    points.push(x - tangentX, y - tangentY, x + tangentX, y + tangentY, hueOffsets[line.hue]);
  }

  for (let layer = 0; layer < lineBuckets.length; layer += 1) {
    const points = lineBuckets[layer];
    context.beginPath();
    for (let index = 0; index < points.length; index += 5) {
      context.moveTo(points[index], points[index + 1]);
      context.lineTo(points[index + 2], points[index + 3]);
    }
    context.strokeStyle = `hsla(${hue}, 100%, 78%, ${layer === 0 ? 0.22 : layer === 1 ? 0.48 : 0.82})`;
    context.lineWidth = layer === 2 ? 0.75 : 0.55;
    context.stroke();
  }

  context.lineWidth = 0.7;
  for (const ribbon of energyRibbons) {
    context.beginPath();
    for (let segment = 0; segment < 144; segment += 1) {
      const progress = segment / 143;
      const angle =
        progress * Math.PI * 5 * ribbon.direction +
        ribbon.phase +
        time * ribbon.speed * (listening ? 1.8 : 1);
      const radius = coreRadius + 5 + progress * (outerRadius - coreRadius - 5);
      const depth = Math.sin(angle * 0.72 + ribbon.phase);
      const perspective = 1 + depth * 0.13;
      const x = centerX + Math.cos(angle) * radius * perspective;
      const y = centerY + Math.sin(angle) * radius * 0.56 * perspective;
      if (segment === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.strokeStyle = `hsla(${hue + 12}, 100%, 76%, 0.28)`;
    context.stroke();
  }

  animationFrame = requestAnimationFrame(drawOrbit);
}

function resumeOrbit() {
  if (!animationFrame && !document.hidden) {
    animationFrame = requestAnimationFrame(drawOrbit);
  }
}

document.addEventListener("visibilitychange", resumeOrbit);
new ResizeObserver(resumeOrbit).observe(orbCanvas);
resumeOrbit();

function setState(state, label) {
  orb.dataset.state = state;
  connectionLabel.textContent = label;
}

function scrollToBottom() {
  conversation.scrollTop = conversation.scrollHeight;
}

function appendMessage(role, content, className = "") {
  const message = document.createElement("div");
  message.className = `message ${role} ${className}`.trim();

  const avatar = document.createElement("div");
  avatar.className = "message-avatar";
  avatar.textContent = role === "assistant" ? "A" : "Você";

  const text = document.createElement("div");
  text.className = "message-content";
  text.textContent = content;

  message.append(avatar, text);
  messagesElement.append(message);
  scrollToBottom();
  return message;
}

function showConversation() {
  welcome.hidden = true;
  conversation.classList.add("chatting");
  messagesElement.classList.add("active");
}

async function syncAccountConversation() {
  if (!(await window.astra.getAccount())) return;
  const saved = await window.astra.saveAccountChat({
    chatId: activeAccountChatId,
    messages: history
  });
  activeAccountChatId = saved.id;
  await refreshAccountChats();
}

async function sendMessage(value) {
  const content = value.trim();
  if (!content || isSending) return;
  const tvIntent = activeTVHost ? getTVIntent(content) : undefined;
  if (tvIntent) {
    await sendTVIntent(content, tvIntent);
    return;
  }
  showConversation();
  history.push({ role: "user", content });
  appendMessage("user", content);
  input.value = "";
  input.style.height = "auto";
  isSending = true;
  setState("thinking", "A Astra está pensando...");
  const typing = appendMessage("assistant", "Preparando uma resposta...", "typing");
  const typingContent = typing.querySelector(".message-content");
  let receivedFirstChunk = false;

  try {
    const reply = await window.astra.sendMessage(history, (chunk) => {
      if (!receivedFirstChunk) {
        typingContent.textContent = "";
        typing.classList.remove("typing");
        receivedFirstChunk = true;
      }
      typingContent.textContent += chunk;
      setState("speaking", "A Astra está respondendo");
      scrollToBottom();
    }, educationMode);
    typing.remove();
    history.push({ role: "assistant", content: reply });
    appendMessage("assistant", reply);
    try {
      await syncAccountConversation();
    } catch (syncError) {
      appendMessage("assistant", `Não foi possível sincronizar esta conversa: ${syncError.message}`);
    }
    setState("speaking", "A Astra está respondendo");
    if ("speechSynthesis" in window) {
      const utterance = new SpeechSynthesisUtterance(reply);
      utterance.lang = "pt-BR";
      utterance.onend = () => setState("idle", "Pronta para conversar");
      utterance.onerror = () => setState("idle", "Pronta para conversar");
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    } else {
      setState("idle", "Pronta para conversar");
    }
  } catch (error) {
    typing.remove();
    appendMessage("assistant", `Não consegui responder: ${error.message}`);
    try {
      await syncAccountConversation();
    } catch (syncError) {
      appendMessage("assistant", `Não foi possível salvar esta conversa: ${syncError.message}`);
    }
    setState("idle", "Pronta para conversar");
  } finally {
    isSending = false;
  }
}

function normalizeCommand(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function getTVIntent(text) {
  const normalized = normalizeCommand(text);
  if (
    /\bspotify\b/.test(normalized) &&
    /\b(toque|tocar|toca|coloque|colocar|reproduza|reproduzir|play)\b/.test(normalized)
  ) {
    return { action: "spotify-play" };
  }
  if (
    /\bspotify\b/.test(normalized) &&
    /\b(abra|abre|abrir|inicie|iniciar)\b/.test(normalized)
  ) {
    return { action: "spotify-open" };
  }
  if (/\b(tv|televisao)\b/.test(normalized) && /\b(pause|pausa|pausar)\b/.test(normalized)) {
    return { action: "pause" };
  }
  if (
    /\b(tv|televisao)\b/.test(normalized) &&
    /\b(retome|retomar|continue|continuar|reproduza|reproduzir|play)\b/.test(normalized)
  ) {
    return { action: "play" };
  }
  const openMatch = normalized.match(/^(?:abra|abre|abrir|inicie|iniciar)\s+(.+)/);
  if (openMatch) {
    const requestedApp = openMatch[1]
      .replace(/\b(na tv|na televisao|por favor)\b/g, "")
      .replace(/[.!?]+$/, "")
      .trim();
    const appInfo = pairedTVApps.find((entry) => {
      const title = normalizeCommand(entry.title);
      const id = normalizeCommand(entry.id);
      return requestedApp === title || requestedApp === id;
    });
    const explicitlyTargetsTV = /\b(na tv|na televisao)\b/.test(normalized);
    if (appInfo || explicitlyTargetsTV) {
      return {
        action: "open-app-name",
        name: appInfo ? appInfo.title : requestedApp
      };
    }
  }
  return undefined;
}

async function sendTVIntent(text, intent) {
  showConversation();
  appendMessage("user", text);
  input.value = "";
  input.style.height = "auto";
  isSending = true;
  setState("thinking", "Enviando comando autorizado à TV...");
  const progress = appendMessage("assistant", "Enviando comando à TV...", "typing");
  try {
    const result = await window.astra.tvAction({
      host: activeTVHost,
      ...intent
    });
    progress.remove();
    const confirmation =
      intent.action === "spotify-play"
        ? "Abri o Spotify e enviei play. Para escolher uma música específica, abra a busca no Spotify da TV, escreva o pedido no painel “Conectar à TV” e confirme."
        : result.message;
    appendMessage("assistant", confirmation);
    setState("idle", "Comando enviado à TV");
  } catch (error) {
    progress.remove();
    appendMessage("assistant", `Não consegui controlar a TV: ${error.message}`);
    setState("idle", "Pronta para conversar");
  } finally {
    isSending = false;
  }
}

composer.addEventListener("submit", (event) => {
  event.preventDefault();
  sendMessage(input.value);
});

input.addEventListener("input", () => {
  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 130)}px`;
});

input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    composer.requestSubmit();
  }
});

document.getElementById("new-chat").addEventListener("click", () => {
  activeAccountChatId = "";
  history.length = 0;
  messagesElement.replaceChildren();
  messagesElement.classList.remove("active");
  conversation.classList.remove("chatting");
  welcome.hidden = false;
  window.speechSynthesis?.cancel();
  setState("idle", "Pronta para conversar");
});

function renderAccountChats(chats) {
  accountHistory.replaceChildren();
  accountHistory.hidden = chats.length === 0;
  for (const chat of chats) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "account-chat";
    button.textContent = chat.title;
    button.title = chat.title;
    button.addEventListener("click", async () => {
      try {
        const selected = await window.astra.loadAccountChat(chat.id);
        activeAccountChatId = selected.id;
        history.splice(0, history.length, ...selected.messages);
        messagesElement.replaceChildren();
        for (const message of history) appendMessage(message.role, message.content);
        showConversation();
        setState("idle", "Conversa sincronizada");
      } catch (error) {
        appendMessage("assistant", `Não foi possível abrir a conversa: ${error.message}`);
      }
    });
    accountHistory.append(button);
  }
}

async function refreshAccountChats() {
  const chats = await window.astra.listAccountChats();
  renderAccountChats(chats);
}

function setAccountMode(registering) {
  accountRegistering = registering;
  document.getElementById("account-title").textContent = registering
    ? "Criar conta Astra"
    : "Entrar na sua conta Astra";
  accountSubmit.textContent = registering ? "Criar conta" : "Entrar";
  accountModeButton.textContent = registering ? "Já tenho conta" : "Criar conta";
  document.getElementById("account-password").autocomplete = registering
    ? "new-password"
    : "current-password";
  accountError.textContent = "";
}

document.getElementById("open-account").addEventListener("click", async () => {
  const account = await window.astra.getAccount();
  if (account) {
    try {
      await window.astra.logoutAccount();
      accountLabel.textContent = "Entrar e sincronizar";
      accountHistory.replaceChildren();
      accountHistory.hidden = true;
      activeAccountChatId = "";
      setState("idle", "Saiu da conta Astra");
    } catch (error) {
      appendMessage("assistant", `Não foi possível sair da conta: ${error.message}`);
    }
    return;
  }
  accountError.textContent = "";
  setAccountMode(false);
  accountModal.classList.remove("hidden");
  document.getElementById("account-email").focus();
});

document.getElementById("close-account").addEventListener("click", () => {
  accountModal.classList.add("hidden");
});
accountModal.addEventListener("click", (event) => {
  if (event.target === accountModal) accountModal.classList.add("hidden");
});
accountModeButton.addEventListener("click", () => setAccountMode(!accountRegistering));
accountForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  accountSubmit.disabled = true;
  accountError.textContent = "";
  try {
    const account = await window.astra.authenticateAccount({
      apiBase: document.getElementById("account-api").value,
      email: document.getElementById("account-email").value,
      password: document.getElementById("account-password").value,
      registering: accountRegistering
    });
    accountLabel.textContent = account.email;
    document.getElementById("account-password").value = "";
    accountModal.classList.add("hidden");
    await refreshAccountChats();
    setState("idle", "Conversas sincronizadas");
  } catch (error) {
    accountError.textContent = error.message;
  } finally {
    accountSubmit.disabled = false;
  }
});

window.astra.getAccount().then(async (account) => {
  if (!account) return;
  accountLabel.textContent = account.email;
  await refreshAccountChats();
}).catch((error) => {
  appendMessage("assistant", `Não foi possível carregar as conversas sincronizadas: ${error.message}`);
});

document.querySelectorAll(".suggestion").forEach((button) => {
  button.addEventListener("click", () => {
    if (button.dataset.educationPrompt) {
      setEducationMode(true);
      sendMessage(button.dataset.educationPrompt);
      return;
    }
    sendMessage(button.dataset.prompt);
  });
});

function stopRecognition() {
  recognition?.stop();
  recognition = undefined;
  voiceButton.classList.remove("listening");
  if (orb.dataset.state === "listening") setState("idle", "Pronta para conversar");
}

function startRecognition() {
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    appendMessage("assistant", "O reconhecimento de voz não está disponível neste computador. Você ainda pode conversar por texto.");
    showConversation();
    microphoneAllowed = false;
    return false;
  }

  recognition = new SpeechRecognition();
  recognition.lang = "pt-BR";
  recognition.interimResults = true;
  recognition.continuous = false;
  recognition.onstart = () => {
    voiceButton.classList.add("listening");
    setState("listening", "Estou ouvindo você...");
  };
  recognition.onresult = (event) => {
    let finalText = "";
    let interimText = "";
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const transcript = event.results[index][0].transcript;
      if (event.results[index].isFinal) finalText += transcript;
      else interimText += transcript;
    }
    input.value = finalText || interimText;
    input.dispatchEvent(new Event("input"));
    if (finalText) {
      const recognized = finalText;
      stopRecognition();
      sendMessage(recognized);
    }
  };
  recognition.onerror = (event) => {
    appendMessage("assistant", `Não consegui acessar o microfone (${event.error}). Confira a permissão de microfone do sistema e tente novamente.`);
    showConversation();
    if (event.error === "not-allowed" || event.error === "service-not-allowed") {
      microphoneAllowed = false;
      window.astra.revokeMicrophone().catch((error) => {
        console.error("Não foi possível revogar a permissão do microfone:", error);
      });
    }
    stopRecognition();
  };
  recognition.onend = () => {
    recognition = undefined;
    voiceButton.classList.remove("listening");
    if (orb.dataset.state === "listening") setState("idle", "Pronta para conversar");
  };
  try {
    recognition.start();
    return true;
  } catch (error) {
    recognition = undefined;
    appendMessage("assistant", `Não consegui iniciar o reconhecimento de voz: ${error.message}`);
    showConversation();
    setState("idle", "Pronta para conversar");
    return false;
  }
}

function openVoicePermission() {
  voicePermissionError.textContent = "";
  voicePermissionModal.classList.remove("hidden");
  allowVoicePermissionButton.focus();
}

async function requestVoicePermission() {
  if (microphoneRequestPending) return;
  microphoneRequestPending = true;
  allowVoicePermissionButton.disabled = true;
  allowVoicePermissionButton.textContent = "Solicitando...";
  voicePermissionError.textContent = "";

  try {
    await window.astra.allowMicrophone();
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Este computador não oferece suporte ao acesso ao microfone pelo app.");
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    microphoneAllowed = true;
    voicePermissionModal.classList.add("hidden");
    startRecognition();
  } catch (error) {
    try {
      await window.astra.revokeMicrophone();
    } catch (revokeError) {
      console.error("Não foi possível revogar a permissão do microfone:", revokeError);
    }
    const message =
      error.name === "NotAllowedError" || error.name === "PermissionDeniedError"
        ? "O acesso ao microfone foi negado. Verifique a permissão de microfone do sistema e tente novamente."
        : `Não foi possível acessar o microfone: ${error.message}`;
    voicePermissionError.textContent = message;
  } finally {
    microphoneRequestPending = false;
    allowVoicePermissionButton.disabled = false;
    allowVoicePermissionButton.textContent = "Permitir microfone";
  }
}

voiceButton.addEventListener("click", () => {
  if (recognition) {
    stopRecognition();
    return;
  }
  if (!(window.SpeechRecognition || window.webkitSpeechRecognition)) {
    startRecognition();
    return;
  }
  if (microphoneAllowed) {
    startRecognition();
    return;
  }
  openVoicePermission();
});

allowVoicePermissionButton.addEventListener("click", requestVoicePermission);
document.getElementById("decline-voice-permission").addEventListener("click", () => {
  voicePermissionModal.classList.add("hidden");
});
document.getElementById("close-voice-permission").addEventListener("click", () => {
  voicePermissionModal.classList.add("hidden");
});
voicePermissionModal.addEventListener("click", (event) => {
  if (event.target === voicePermissionModal) {
    voicePermissionModal.classList.add("hidden");
  }
});

async function openSettings() {
  settingsError.textContent = "";
  connectionTest.textContent = "";
  try {
    const settings = await window.astra.getSettings();
    providerSelect.value = settings.provider;
    document.getElementById("endpoint").value = settings.endpoint;
    document.getElementById("model").value = settings.model;
    document.getElementById("api-key").value = "";
    document.getElementById("key-status").textContent = settings.hasApiKey
      ? "chave protegida salva"
      : "nenhuma chave salva";
    document.getElementById("clear-key").checked = false;
    previousProvider = settings.provider;
    updateProviderFields();
    modal.classList.remove("hidden");
  } catch (error) {
    settingsError.textContent = error.message;
    modal.classList.remove("hidden");
  }
}

function setTVStatus(message) {
  tvStatus.textContent = message;
  tvError.textContent = "";
}

function renderDiscoveredTVs(devices) {
  tvDevices.replaceChildren();
  if (!devices.length) {
    tvDevices.textContent = "Nenhuma TV LG webOS foi encontrada na rede local.";
    return;
  }

  for (const device of devices) {
    const row = document.createElement("div");
    row.className = "tv-device";
    const details = document.createElement("div");
    const name = document.createElement("div");
    name.className = "tv-device-name";
    name.textContent = device.name;
    const address = document.createElement("div");
    address.className = "tv-device-host";
    address.textContent = device.host;
    details.append(name, address);

    const connectButton = document.createElement("button");
    connectButton.type = "button";
    connectButton.textContent = pairedTVs.some((paired) => paired.host === device.host)
      ? "Conectar"
      : "Parear";
    connectButton.addEventListener("click", () => connectToTV(device, connectButton));

    row.append(details, connectButton);
    tvDevices.append(row);
  }
}

async function connectToTV(device, button) {
  button.disabled = true;
  setTVStatus("Pedido de conexão enviado. Aprove na tela da TV LG.");
  try {
    await window.astra.connectTV(device.host);
    await loadTVState();
    await window.astra.selectTV(device.host);
    activeTVHost = device.host;
    tvSelection.value = activeTVHost;
    await refreshTVApps();
    setTVStatus(`Conectada à ${device.name}.`);
  } catch (error) {
    tvError.textContent = error.message;
    tvStatus.textContent = "";
  } finally {
    button.disabled = false;
  }
}

async function loadTVState() {
  const state = await window.astra.getTVs();
  pairedTVs = state.devices;
  activeTVHost = state.activeHost || pairedTVs[0]?.host || "";
  tvSelection.replaceChildren();

  for (const device of pairedTVs) {
    const option = document.createElement("option");
    option.value = device.host;
    option.textContent = `${device.name} (${device.host})`;
    tvSelection.append(option);
  }

  if (activeTVHost) tvSelection.value = activeTVHost;
  tvControls.classList.toggle("hidden", pairedTVs.length === 0);
  return pairedTVs;
}

async function refreshTVApps() {
  const host = tvSelection.value;
  if (!host) return;
  tvStatus.textContent = "Lendo os aplicativos instalados na TV...";
  tvError.textContent = "";
  try {
    pairedTVApps = await window.astra.getTVApps(host);
    tvAppsSelect.replaceChildren();
    for (const appInfo of pairedTVApps) {
      const option = document.createElement("option");
      option.value = appInfo.id;
      option.textContent = appInfo.title;
      tvAppsSelect.append(option);
    }
    tvStatus.textContent = pairedTVApps.length
      ? `${pairedTVApps.length} aplicativos encontrados.`
      : "A TV não informou aplicativos instalados.";
  } catch (error) {
    tvError.textContent = error.message;
    tvStatus.textContent = "";
  }
}

async function runTVAction(action, extra = {}) {
  const host = tvSelection.value || activeTVHost;
  if (!host) {
    tvError.textContent = "Primeiro conecte e pareie uma TV LG webOS.";
    return;
  }
  tvError.textContent = "";
  try {
    const result = await window.astra.tvAction({ host, action, ...extra });
    tvStatus.textContent = result.message;
  } catch (error) {
    tvError.textContent = error.message;
    tvStatus.textContent = "";
  }
}

async function openTVPanel() {
  tvError.textContent = "";
  tvStatus.textContent = "";
  tvModal.classList.remove("hidden");
  try {
    await loadTVState();
    renderDiscoveredTVs(pairedTVs);
    if (activeTVHost) await refreshTVApps();
  } catch (error) {
    tvError.textContent = error.message;
  }
}

document.getElementById("open-tv").addEventListener("click", openTVPanel);
document.getElementById("close-tv").addEventListener("click", () => {
  tvModal.classList.add("hidden");
});
tvModal.addEventListener("click", (event) => {
  if (event.target === tvModal) tvModal.classList.add("hidden");
});

document.getElementById("tv-discover").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  button.textContent = "Buscando...";
  tvError.textContent = "";
  setTVStatus("Buscando TVs LG webOS na rede local...");
  try {
    const result = await window.astra.discoverTVs();
    renderDiscoveredTVs(result.devices);
    const searchDetail =
      `${result.interfaceCount} interface(s) de rede pesquisada(s); ` +
      `${result.responseCount} resposta(s) SSDP recebida(s).`;
    tvStatus.textContent = result.devices.length
      ? `Encontrei ${result.devices.length} TV(s) LG webOS. ${searchDetail}`
      : result.responseCount
        ? `A rede respondeu, mas nenhuma resposta identificou uma LG webOS. ${searchDetail} Tente informar o IP.`
        : `A busca SSDP terminou sem respostas. Confira se PC e TV estão na mesma rede (sem rede de convidados) ou tente informar o IP. ${searchDetail}`;
  } catch (error) {
    tvError.textContent = error.message;
    tvStatus.textContent = "";
  } finally {
    button.disabled = false;
    button.textContent = "Buscar TVs na rede local";
  }
});

document.getElementById("tv-connect-ip").addEventListener("click", async (event) => {
  const host = document.getElementById("tv-manual-ip").value.trim();
  const button = event.currentTarget;
  if (!host) {
    tvError.textContent = "Digite o endereço IPv4 da TV.";
    return;
  }
  await connectToTV({ host, name: `LG webOS (${host})` }, button);
});

tvSelection.addEventListener("change", async () => {
  activeTVHost = tvSelection.value;
  try {
    await window.astra.selectTV(activeTVHost);
    await refreshTVApps();
  } catch (error) {
    tvError.textContent = error.message;
  }
});

document.getElementById("tv-refresh-apps").addEventListener("click", refreshTVApps);
document.getElementById("tv-open-app").addEventListener("click", () =>
  runTVAction("open-app", { appId: tvAppsSelect.value })
);
document.getElementById("tv-spotify-play").addEventListener("click", () =>
  runTVAction("spotify-play")
);
document.getElementById("tv-play").addEventListener("click", () =>
  runTVAction("play")
);
document.getElementById("tv-pause").addEventListener("click", () =>
  runTVAction("pause")
);
document.getElementById("tv-send-text").addEventListener("click", () =>
  runTVAction("type-text", { text: document.getElementById("tv-text").value })
);
document.getElementById("tv-enter").addEventListener("click", () =>
  runTVAction("enter")
);

function updateProviderFields() {
  const isLocal = providerSelect.value === "ollama";
  const defaults = {
    ollama: { endpoint: "http://127.0.0.1:11434", model: "qwen2.5:3b" },
    openai: { endpoint: "https://api.openai.com/v1", model: "gpt-4o-mini" }
  };
  const endpoint = document.getElementById("endpoint");
  const model = document.getElementById("model");
  if (providerSelect.value !== previousProvider) {
    if (endpoint.value === defaults[previousProvider].endpoint) {
      endpoint.value = defaults[providerSelect.value].endpoint;
    }
    if (model.value === defaults[previousProvider].model) {
      model.value = defaults[providerSelect.value].model;
    }
    previousProvider = providerSelect.value;
  }
  document.getElementById("endpoint-label").textContent = isLocal
    ? "Endereço do Ollama"
    : "Endereço da API";
  endpoint.placeholder = isLocal
    ? "http://127.0.0.1:11434"
    : "https://api.openai.com/v1";
  model.placeholder = isLocal
    ? "qwen2.5:3b"
    : "gpt-4o-mini";
  document.getElementById("api-key-fields").classList.toggle("hidden", isLocal);
}

providerSelect.addEventListener("change", updateProviderFields);

testConnectionButton.addEventListener("click", async () => {
  settingsError.textContent = "";
  connectionTest.textContent = "";
  testConnectionButton.disabled = true;
  testConnectionButton.textContent = "Testando...";
  try {
    if (providerSelect.value === "ollama") {
      await window.astra.testOllama({
        endpoint: document.getElementById("endpoint").value,
        model: document.getElementById("model").value
      });
      connectionTest.textContent = "Ollama conectado; modelo encontrado.";
    } else {
      connectionTest.textContent =
        "A conexão externa será verificada ao enviar uma mensagem.";
    }
  } catch (error) {
    settingsError.textContent = error.message;
  } finally {
    testConnectionButton.disabled = false;
    testConnectionButton.textContent = "Testar conexão";
  }
});

document.getElementById("open-settings").addEventListener("click", openSettings);
document.getElementById("open-settings-mobile").addEventListener("click", openSettings);
document.getElementById("close-settings").addEventListener("click", () => {
  modal.classList.add("hidden");
});
modal.addEventListener("click", (event) => {
  if (event.target === modal) modal.classList.add("hidden");
});

settingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  settingsError.textContent = "";
  try {
    await window.astra.saveSettings({
      provider: providerSelect.value,
      endpoint: document.getElementById("endpoint").value,
      model: document.getElementById("model").value,
      apiKey: document.getElementById("api-key").value,
      clearApiKey: document.getElementById("clear-key").checked
    });
    modal.classList.add("hidden");
    setState("idle", "Configurações salvas");
    window.setTimeout(() => setState("idle", "Pronta para conversar"), 1800);
  } catch (error) {
    settingsError.textContent = error.message;
  }
});

window.addEventListener("beforeunload", () => {
  window.speechSynthesis?.cancel();
  recognition?.stop();
});
