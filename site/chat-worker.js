import { env, pipeline } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/+esm";

const MODEL_ID = "onnx-community/Qwen2.5-0.5B-Instruct";
const SYSTEM_PROMPT =
  "Você é Astra, uma assistente prestativa e acolhedora. Responda em português brasileiro, com clareza, sem inventar detalhes e de forma concisa. Se não souber, diga que não sabe.";
let generatorPromise;
let generationQueue = Promise.resolve();

env.allowLocalModels = false;
env.backends.onnx.wasm.wasmPaths =
  "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0-dev.20250409-89f8206ba4/dist/";

function setStatus(message) {
  self.postMessage({ type: "status", message });
}

async function loadGenerator() {
  if (!generatorPromise) {
    generatorPromise = (async () => {
      const hasWebGPU = Boolean(self.navigator.gpu && await self.navigator.gpu.requestAdapter());
      const device = hasWebGPU ? "webgpu" : "wasm";
      const dtype = hasWebGPU ? "q4f16" : "q4";
      setStatus(
        hasWebGPU
          ? "Baixando o modelo local (cerca de 500 MB)..."
          : "WebGPU não disponível; baixando o modelo local para CPU (cerca de 800 MB)..."
      );
      return pipeline("text-generation", MODEL_ID, {
        device,
        dtype,
        progress_callback: (progress) => {
          if (progress.status === "progress" && Number.isFinite(progress.progress)) {
            setStatus(`Baixando modelo local: ${Math.round(progress.progress)}%`);
          } else if (progress.status === "ready") {
            setStatus("Modelo local pronto.");
          }
        }
      });
    })().catch((error) => {
      generatorPromise = undefined;
      throw error;
    });
  }
  return generatorPromise;
}

async function generate(messages) {
  const generator = await loadGenerator();
  setStatus("A Astra está pensando neste aparelho...");
  const output = await generator(
    [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
    {
      max_new_tokens: 120,
      do_sample: true,
      temperature: 0.7,
      top_p: 0.9,
      repetition_penalty: 1.1
    }
  );
  const generated = output?.[0]?.generated_text;
  const response = Array.isArray(generated)
    ? generated.at(-1)?.content
    : typeof generated === "string"
      ? generated
      : "";
  if (typeof response !== "string" || !response.trim()) {
    throw new Error("O modelo local não gerou uma resposta. Tente novamente.");
  }
  setStatus("Modelo pronto neste aparelho.");
  return response.trim();
}

self.addEventListener("message", (event) => {
  const { type, requestId, messages } = event.data || {};
  if (type !== "generate") return;
  generationQueue = generationQueue.then(async () => {
    try {
      const result = await generate(messages);
      self.postMessage({ type: "result", requestId, result });
    } catch (error) {
      self.postMessage({
        type: "error",
        requestId,
        message: error.message || "Não foi possível iniciar o modelo local."
      });
    }
  });
});
