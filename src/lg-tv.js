const dgram = require("node:dgram");
const net = require("node:net");
const os = require("node:os");
const WebSocket = require("ws");

const SSDP_GROUP = "239.255.255.250";
const SSDP_PORT = 1900;
const WEBOS_SERVICE = "urn:lge-com:service:webos-second-screen:1";
const REGISTER_ID = "astra-register";
const LG_CERT_FINGERPRINTS = new Set([
  "E2:BD:64:64:D3:F5:1C:1B:95:B7:69:7D:9D:67:73:C3:3D:94:12:EB:A0:29:9C:56:8C:34:93:7D:3F:E6:8A:A0",
  "11:C5:B1:C5:90:77:50:AB:B9:DA:2A:66:65:CC:CE:2B:B2:88:A5:83:F4:5A:33:39:E7:1F:87:BF:2F:80:85:52"
]);

function isPrivateIPv4(host) {
  if (net.isIP(host) !== 4) return false;
  const octets = host.split(".").map(Number);
  return (
    octets[0] === 10 ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168)
  );
}

function decodeXml(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'");
}

function parseSsdpResponse(text, sourceAddress) {
  const headers = new Map(
    text
      .split(/\r?\n/)
      .slice(1)
      .map((line) => {
        const separator = line.indexOf(":");
        return separator < 0
          ? ["", ""]
          : [
              line.slice(0, separator).trim().toLowerCase(),
              line.slice(separator + 1).trim()
            ];
      })
      .filter(([key]) => key)
  );
  const service = headers.get("st") || headers.get("nt") || "";
  const location = headers.get("location");
  if (!location) return undefined;

  let parsedLocation;
  try {
    parsedLocation = new URL(location);
  } catch {
    return undefined;
  }
  if (
    parsedLocation.protocol !== "http:" ||
    parsedLocation.hostname !== sourceAddress ||
    !isPrivateIPv4(sourceAddress)
  ) {
    return undefined;
  }

  return {
    host: sourceAddress,
    location: parsedLocation.toString(),
    service: service.toLowerCase()
  };
}

async function getTVName(tv) {
  try {
    const response = await fetch(tv.location, {
      signal: AbortSignal.timeout(1800)
    });
    if (!response.ok) return undefined;
    const description = await response.text();
    const isWebOS =
      tv.service.includes("webos") ||
      /<manufacturer[^>]*>\s*LG Electronics\s*<\/manufacturer>/i.test(description) ||
      /<modelDescription[^>]*>[^<]*webOS[^<]*<\/modelDescription>/i.test(description) ||
      /<deviceType[^>]*>[^<]*lge-com:service:webos/i.test(description);
    if (!isWebOS) return undefined;
    const name = description.match(/<friendlyName>\s*([^<]+)\s*<\/friendlyName>/i)?.[1];
    return name ? decodeXml(name).slice(0, 100) : "LG webOS TV";
  } catch {
    return tv.service.includes("webos") ? "LG webOS TV" : undefined;
  }
}

function getNetworkInterfaces() {
  return Object.entries(os.networkInterfaces())
    .flatMap(([name, addresses]) =>
      (addresses || [])
        .filter(
          (address) =>
            address.family === "IPv4" &&
            !address.internal &&
            isPrivateIPv4(address.address)
        )
        .map((address) => ({ name, address: address.address }))
    );
}

function discoverLGTVs(timeoutMs = 4500) {
  return new Promise((resolve, reject) => {
    const interfaces = getNetworkInterfaces();
    const found = new Map();
    let responseCount = 0;
    let pendingSockets = 0;
    let finished = false;
    const sockets = new Set();

    const finish = async (error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      for (const socket of sockets) {
        socket.removeAllListeners();
        try {
          socket.close();
        } catch {}
      }
      if (error) {
        reject(error);
        return;
      }
      const discovered = await Promise.all(
        [...found.values()].map(async (device) => ({
          host: device.host,
          name: await getTVName(device)
        }))
      );
      resolve({
        devices: discovered.filter((device) => device.name),
        interfaceCount: interfaces.length,
        responseCount
      });
    };

    const timer = setTimeout(() => finish(), timeoutMs);
    if (!interfaces.length) {
      finish(new Error("Não encontrei uma interface IPv4 privada para pesquisar a TV."));
      return;
    }

    const targets = [WEBOS_SERVICE, "ssdp:all", "upnp:rootdevice"];
    pendingSockets = interfaces.length;
    for (const networkInterface of interfaces) {
      const socket = dgram.createSocket({ type: "udp4", reuseAddr: true });
      sockets.add(socket);
      let socketFinished = false;
      const finishSocket = () => {
        if (socketFinished) return;
        socketFinished = true;
        pendingSockets -= 1;
        if (pendingSockets === 0) finish();
      };

      socket.on("error", finishSocket);
      socket.on("message", (message, remote) => {
        responseCount += 1;
        const tv = parseSsdpResponse(message.toString("utf8"), remote.address);
        if (tv) found.set(tv.host, tv);
      });

      socket.bind(0, networkInterface.address, () => {
        try {
          socket.setMulticastInterface(networkInterface.address);
          socket.setMulticastTTL(2);
        } catch {
          finishSocket();
          return;
        }
        let pendingSends = targets.length;
        for (const target of targets) {
          const search = Buffer.from(
            [
              "M-SEARCH * HTTP/1.1",
              `HOST: ${SSDP_GROUP}:${SSDP_PORT}`,
              'MAN: "ssdp:discover"',
              "MX: 2",
              `ST: ${target}`,
              "",
              ""
            ].join("\r\n")
          );
          socket.send(search, SSDP_PORT, SSDP_GROUP, () => {
            pendingSends -= 1;
            if (pendingSends === 0) {
              setTimeout(finishSocket, timeoutMs);
            }
          });
        }
      });
    }
  });
}

function hasTrustedLgCertificate(socket) {
  let certificate = socket._socket?.getPeerCertificate(true);
  const seen = new Set();
  while (certificate?.fingerprint256 && !seen.has(certificate.fingerprint256)) {
    if (LG_CERT_FINGERPRINTS.has(certificate.fingerprint256.toUpperCase())) {
      return true;
    }
    seen.add(certificate.fingerprint256);
    certificate = certificate.issuerCertificate;
  }
  return false;
}

class LGTVSession {
  constructor(host, clientKey, onKey, onPairingPrompt) {
    this.host = host;
    this.clientKey = clientKey;
    this.onKey = onKey;
    this.onPairingPrompt = onPairingPrompt;
    this.socket = undefined;
    this.pending = new Map();
    this.nextId = 0;
    this.connected = false;
  }

  async connect() {
    let lastError;
    try {
      await this.connectTo(`wss://${this.host}:3001`, true);
      return this;
    } catch (error) {
      if (error.code === "EPAIRING" || error.code === "ECERT") throw error;
      lastError = error;
    }

    try {
      await this.connectTo(`ws://${this.host}:3000`, false);
      return this;
    } catch (error) {
      throw new Error(
        `Não consegui conectar à LG webOS (${lastError.message}; ${error.message}).`
      );
    }
  }

  connectTo(url, secure) {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url, {
        rejectUnauthorized: secure ? false : undefined,
        handshakeTimeout: 5000,
        perMessageDeflate: false
      });
      this.socket = socket;
      let settled = false;
      let pairingRequested = false;
      let registrationSent = false;
      const timeout = setTimeout(() => {
        const error = new Error("A TV não concluiu o pareamento em 45 segundos.");
        if (registrationSent) error.code = "EPAIRING";
        fail(error);
      }, 45000);

      const cleanup = () => {
        clearTimeout(timeout);
        socket.removeListener("open", onOpen);
      };
      const fail = (error) => {
        if (settled) return;
        settled = true;
        cleanup();
        socket.removeAllListeners("message");
        socket.removeAllListeners("error");
        socket.removeAllListeners("close");
        if (socket.readyState === WebSocket.OPEN) socket.close();
        else socket.terminate();
        if (error.message.includes("cancelled") || error.message.includes("denied")) {
          error.code = "EPAIRING";
        }
        reject(error);
      };
      const onMessage = async (raw) => {
        let message;
        try {
          message = JSON.parse(raw.toString());
        } catch {
          return;
        }

        const payload = message.payload || {};
        const request = this.pending.get(message.id);
        if (request) {
          this.pending.delete(message.id);
          if (message.type === "error" || payload.returnValue === false) {
            request.reject(new Error(payload.errorText || "A TV recusou a ação."));
          } else {
            request.resolve(payload);
          }
        }

        if (message.id !== REGISTER_ID) return;
        if (message.type === "error" || payload.returnValue === false) {
          fail(Object.assign(new Error(payload.errorText || "Pareamento recusado na TV."), {
            code: "EPAIRING"
          }));
          return;
        }
        if (!payload["client-key"]) {
          if (!pairingRequested) {
            pairingRequested = true;
            this.onPairingPrompt();
          }
          return;
        }

        try {
          await this.onKey(payload["client-key"]);
          this.clientKey = payload["client-key"];
          this.connected = true;
          settled = true;
          cleanup();
          socket.removeListener("open", onOpen);
          resolve(this);
        } catch (error) {
          fail(new Error(`Não consegui salvar o pareamento: ${error.message}`));
        }
      };
      const onOpen = () => {
        if (secure && !hasTrustedLgCertificate(socket)) {
          const error = new Error("O certificado seguro não foi reconhecido como uma TV LG webOS.");
          error.code = "ECERT";
          fail(error);
          return;
        }
        const payload = {
          forcePairing: false,
          pairingType: "PROMPT",
          manifest: {
            manifestVersion: 1,
            appVersion: "1.0",
            permissions: [
              "LAUNCH",
              "READ_INSTALLED_APPS",
              "CONTROL_INPUT_TEXT",
              "CONTROL_INPUT_MEDIA_PLAYBACK"
            ]
          }
        };
        if (this.clientKey) payload["client-key"] = this.clientKey;
        registrationSent = true;
        socket.send(JSON.stringify({ id: REGISTER_ID, type: "register", payload }));
      };

      socket.on("open", onOpen);
      socket.on("message", onMessage);
      socket.once("error", (error) => {
        if (!settled) fail(error);
      });
      socket.once("close", () => {
        this.connected = false;
        for (const [id, request] of this.pending) {
          this.pending.delete(id);
          request.reject(new Error("A conexão com a TV foi encerrada."));
        }
        if (!settled) fail(new Error("A TV fechou a conexão antes do pareamento."));
      });
    });
  }

  request(uri, payload = {}) {
    if (!this.connected || this.socket?.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("A TV não está conectada. Conecte novamente."));
    }
    const id = `astra-${++this.nextId}`;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("A TV demorou demais para responder."));
      }, 10000);
      this.pending.set(id, {
        resolve: (result) => {
          clearTimeout(timeout);
          resolve(result);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        }
      });
      this.socket.send(JSON.stringify({ id, type: "request", uri, payload }));
    });
  }

  async disconnect() {
    this.connected = false;
    for (const [id, request] of this.pending) {
      this.pending.delete(id);
      request.reject(new Error("Conexão com a TV encerrada."));
    }
    if (this.socket && this.socket.readyState < WebSocket.CLOSING) {
      await new Promise((resolve) => {
        this.socket.once("close", resolve);
        this.socket.close();
        setTimeout(resolve, 1000).unref();
      });
    }
  }
}

module.exports = { discoverLGTVs, isPrivateIPv4, LGTVSession };
