import { env, pipeline } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/+esm";

const MODEL_ID = "onnx-community/Qwen2.5-1.5B-Instruct";
const SYSTEM_PROMPT =
  "Você é Astra, uma assistente prestativa e acolhedora. Responda em português brasileiro, com clareza e diretamente à pergunta mais recente. Não repita respostas anteriores nem invente detalhes. Se não souber, diga que não sabe.";
let generatorPromise;

env.allowLocalModels = false;
env.backends.onnx.wasm.wasmPaths =
  "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0-dev.20250409-89f8206ba4/dist/";

function createGenerator(device, dtype, onStatus) {
  return pipeline("text-generation", MODEL_ID, {
    device,
    dtype,
    progress_callback: (progress) => {
      if (progress.status === "progress" && Number.isFinite(progress.progress)) {
        onStatus(`Baixando modelo local: ${Math.round(progress.progress)}%`);
      } else if (progress.status === "ready") {
        onStatus("Modelo local pronto.");
      }
    }
  });
}

async function loadGenerator(onStatus) {
  if (!generatorPromise) {
    generatorPromise = (async () => {
      let adapter;
      try {
        adapter = await self.navigator.gpu?.requestAdapter();
      } catch {
        adapter = null;
      }

      if (adapter) {
        onStatus("Baixando o modelo local com aceleração gráfica (cerca de 1,2 GB)...");
        try {
          return await createGenerator("webgpu", "q4f16", onStatus);
        } catch {
          onStatus("A aceleração gráfica não está disponível; tentando com o processador...");
          return createGenerator("wasm", "q4", onStatus);
        }
      }

      onStatus("Baixando o modelo local para o processador (cerca de 1,8 GB)...");
      return createGenerator("wasm", "q4", onStatus);
    })().catch((error) => {
      generatorPromise = undefined;
      throw error;
    });
  }
  return generatorPromise;
}

export async function generateLocalReply(messages, onStatus = () => {}) {
  const generator = await loadGenerator(onStatus);
  onStatus("A Astra está pensando neste aparelho...");
  const output = await generator(
    [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
    {
      max_new_tokens: 96,
      do_sample: false
    }
  );
  const generated = output?.[0]?.generated_text;
  const response = Array.isArray(generated)
    ? [...generated].reverse().find((message) => message.role === "assistant")?.content
    : typeof generated === "string"
      ? generated
      : "";
  if (typeof response !== "string" || !response.trim()) {
    throw new Error("O modelo local não gerou uma resposta. Tente novamente.");
  }
  onStatus("Modelo pronto neste aparelho.");
  return response.trim();
}
