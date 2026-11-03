const { contextBridge, ipcRenderer } = require("electron");

let nextRequestId = 0;

contextBridge.exposeInMainWorld("astra", {
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveSettings: (settings) => ipcRenderer.invoke("settings:save", settings),
  allowMicrophone: () => ipcRenderer.invoke("microphone:consent"),
  revokeMicrophone: () => ipcRenderer.invoke("microphone:revoke-consent"),
  testOllama: (settings) => ipcRenderer.invoke("ollama:test", settings),
  getTVs: () => ipcRenderer.invoke("tv:get"),
  discoverTVs: () => ipcRenderer.invoke("tv:discover"),
  connectTV: (host) => ipcRenderer.invoke("tv:connect", { host }),
  getTVApps: (host) => ipcRenderer.invoke("tv:apps", { host }),
  selectTV: (host) => ipcRenderer.invoke("tv:select", { host }),
  tvAction: (action) => ipcRenderer.invoke("tv:action", action),
  onTVStatus: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on("tv:status", listener);
    return () => ipcRenderer.removeListener("tv:status", listener);
  },
  sendMessage: (messages, onChunk, educationMode = false) => {
    const requestId = `${Date.now()}-${++nextRequestId}`;
    const listener = (_event, payload) => {
      if (payload.requestId === requestId) onChunk(payload.chunk);
    };
    ipcRenderer.on("chat:chunk", listener);
    return ipcRenderer
      .invoke("chat:send", { messages, requestId, educationMode })
      .finally(() => ipcRenderer.removeListener("chat:chunk", listener));
  }
});
