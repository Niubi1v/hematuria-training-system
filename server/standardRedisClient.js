const { createClient } = require("redis");
const fs = require("node:fs");

let activeClient = null;
let activeFingerprint = "";

function parseBoolean(value) {
  return /^(1|true|yes|on)$/i.test(String(value || "").trim());
}

function redisNamespace() {
  const namespace = String(process.env.REDIS_NAMESPACE || "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9:_-]{2,63}$/.test(namespace)) {
    throw new Error("redis_namespace_invalid");
  }
  return namespace;
}

function resolveStandardRedisConfig() {
  const explicitUrl = String(process.env.REDIS_URL || "").trim();
  const tls = parseBoolean(process.env.REDIS_TLS);
  let url = explicitUrl;
  let source = "none";

  if (explicitUrl) {
    if (!/^rediss?:\/\//i.test(explicitUrl)) throw new Error("redis_url_invalid");
    source = "standard_redis_url";
  } else {
    const host = String(process.env.REDIS_HOST || "").trim();
    const port = Number(process.env.REDIS_PORT || 6379);
    const username = String(process.env.REDIS_USERNAME || "").trim();
    const password = String(process.env.REDIS_PASSWORD || "");
    if (username && !password) throw new Error("redis_credentials_invalid");
    if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
      return { configured: false, source: "none" };
    }
    const credentials = password
      ? `${username ? `${encodeURIComponent(username)}:` : ":"}${encodeURIComponent(password)}@`
      : "";
    url = `${tls ? "rediss" : "redis"}://${credentials}${host}:${port}`;
    source = "standard_redis_fields";
  }

  const parsed = new URL(url);
  if (!["redis:", "rediss:"].includes(parsed.protocol) || !parsed.hostname) {
    throw new Error("redis_url_invalid");
  }
  const namespace = redisNamespace();
  const caFile = String(process.env.REDIS_CA_FILE || "").trim();
  let ca;
  if (caFile) {
    try {
      ca = fs.readFileSync(caFile, "utf8");
    } catch {
      throw new Error("redis_ca_unavailable");
    }
  }
  const connectTimeout = Math.min(Math.max(Number(process.env.REDIS_CONNECT_TIMEOUT_MS || 5000), 500), 15000);
  const commandTimeout = Math.min(Math.max(Number(process.env.REDIS_COMMAND_TIMEOUT_MS || 5000), 500), 15000);
  return {
    configured: true,
    url,
    namespace,
    source,
    connectTimeout,
    commandTimeout,
    ca,
    fingerprint: JSON.stringify({ url, namespace, connectTimeout, commandTimeout, caFile })
  };
}

async function closeActiveClient() {
  const client = activeClient;
  activeClient = null;
  activeFingerprint = "";
  if (!client) return;
  try {
    if (client.isOpen) await client.close();
  } catch {
    try { client.destroy(); } catch { /* best-effort shutdown */ }
  }
}

async function connectedClient() {
  const config = resolveStandardRedisConfig();
  if (!config.configured) throw new Error("training_attempt_store_unavailable");
  if (activeClient && activeFingerprint !== config.fingerprint) await closeActiveClient();
  if (!activeClient) {
    activeFingerprint = config.fingerprint;
    activeClient = createClient({
      url: config.url,
      socket: {
        connectTimeout: config.connectTimeout,
        keepAlive: true,
        ...(config.url.startsWith("rediss://") ? { tls: true, ca: config.ca, rejectUnauthorized: true } : {}),
        reconnectStrategy(retries) {
          if (retries >= 8) return new Error("redis_reconnect_exhausted");
          return Math.min(100 * (2 ** retries), 3000);
        }
      }
    });
    activeClient.on("error", () => {
      // Deliberately omit URL, credentials, command arguments, prompts and tokens.
    });
  }
  if (!activeClient.isOpen) await activeClient.connect();
  return { client: activeClient, config };
}

async function withCommandTimeout(operation) {
  const { client, config } = await connectedClient();
  let timer;
  try {
    return await Promise.race([
      operation(client),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("redis_command_timeout")), config.commandTimeout);
        timer.unref?.();
      })
    ]);
  } catch {
    throw new Error("training_attempt_store_unavailable");
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function standardRedis(command) {
  if (!Array.isArray(command) || !command.length) throw new Error("training_attempt_store_unavailable");
  const [name, ...args] = command;
  return withCommandTimeout(async (client) => {
    if (String(name).toUpperCase() === "EVAL") {
      const [script, keyCount, ...evalArgs] = args;
      const count = Number(keyCount);
      return client.eval(String(script), {
        keys: evalArgs.slice(0, count).map(String),
        arguments: evalArgs.slice(count).map(String)
      });
    }
    return client.sendCommand([String(name), ...args.map(String)]);
  });
}

function standardRedisConfigured() {
  try {
    return Boolean(resolveStandardRedisConfig().configured);
  } catch {
    return false;
  }
}

function standardRedisCredentialSource() {
  try {
    return resolveStandardRedisConfig().source;
  } catch {
    return "none";
  }
}

module.exports = {
  closeActiveClient,
  redisNamespace,
  resolveStandardRedisConfig,
  standardRedis,
  standardRedisConfigured,
  standardRedisCredentialSource
};
