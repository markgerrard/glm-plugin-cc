/**
 * Pi coding agent RPC integration.
 * Spawns Pi in RPC mode and communicates via JSONL on stdin/stdout.
 */

import { spawn } from "node:child_process";

/**
 * Find the Pi CLI entry point.
 */
function findPiCliPath() {
  // Use the globally installed pi command
  return null; // null = use 'pi' from PATH
}

/**
 * Attach a JSONL line reader to a readable stream.
 */
function attachJsonlReader(stream, onLine) {
  let buffer = "";
  const onData = (chunk) => {
    buffer += chunk.toString();
    let newlineIndex;
    while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (line) onLine(line);
    }
  };
  stream.on("data", onData);
  return () => stream.off("data", onData);
}

/**
 * Create a Pi RPC client that spawns and manages a Pi process.
 */
export function createPiClient(options = {}) {
  let proc = null;
  let stopReading = null;
  let requestId = 0;
  const pendingRequests = new Map();
  const eventListeners = [];
  let stderr = "";

  function handleLine(line) {
    try {
      const data = JSON.parse(line);
      if (data.type === "response" && data.id && pendingRequests.has(data.id)) {
        const pending = pendingRequests.get(data.id);
        pendingRequests.delete(data.id);
        pending.resolve(data);
        return;
      }
      for (const listener of eventListeners) {
        listener(data);
      }
    } catch {
      // Ignore non-JSON lines
    }
  }

  function send(command) {
    if (!proc?.stdin) throw new Error("Pi client not started");
    const id = `req_${++requestId}`;
    const full = { ...command, id };
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingRequests.delete(id);
        reject(new Error(`Timeout waiting for Pi response to ${command.type}`));
      }, 30000);
      pendingRequests.set(id, {
        resolve: (r) => { clearTimeout(timeout); resolve(r); },
        reject: (e) => { clearTimeout(timeout); reject(e); },
      });
      proc.stdin.write(JSON.stringify(full) + "\n");
    });
  }

  function getData(response) {
    if (!response.success) throw new Error(response.error || "Pi RPC error");
    return response.data;
  }

  return {
    async start() {
      if (proc) throw new Error("Already started");

      const args = ["--mode", "rpc", "--no-session"];
      if (options.provider) args.push("--provider", options.provider);
      if (options.model) args.push("--model", options.model);
      if (options.args) args.push(...options.args);

      proc = spawn("pi", args, {
        cwd: options.cwd || process.cwd(),
        env: { ...process.env, ...options.env },
        stdio: ["pipe", "pipe", "pipe"],
      });

      proc.stderr?.on("data", (d) => { stderr += d.toString(); });
      stopReading = attachJsonlReader(proc.stdout, handleLine);

      await new Promise((resolve) => setTimeout(resolve, 500));
      if (proc.exitCode !== null) {
        throw new Error(`Pi exited immediately (code ${proc.exitCode}). stderr: ${stderr}`);
      }
    },

    async stop() {
      if (!proc) return;
      stopReading?.();
      proc.kill("SIGTERM");
      await new Promise((resolve) => {
        const t = setTimeout(() => { proc?.kill("SIGKILL"); resolve(); }, 2000);
        proc?.on("exit", () => { clearTimeout(t); resolve(); });
      });
      proc = null;
      pendingRequests.clear();
    },

    onEvent(listener) {
      eventListeners.push(listener);
      return () => {
        const i = eventListeners.indexOf(listener);
        if (i !== -1) eventListeners.splice(i, 1);
      };
    },

    async prompt(message) {
      await send({ type: "prompt", message });
    },

    async setModel(provider, modelId) {
      const r = await send({ type: "set_model", provider, modelId });
      return getData(r);
    },

    async getState() {
      const r = await send({ type: "get_state" });
      return getData(r);
    },

    async abort() {
      await send({ type: "abort" });
    },

    async getLastAssistantText() {
      const r = await send({ type: "get_last_assistant_text" });
      return getData(r).text;
    },

    waitForIdle(timeout = 300000) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { unsub(); reject(new Error("Pi RPC timeout")); }, timeout);
        const unsub = this.onEvent((event) => {
          if (event.type === "agent_end") {
            clearTimeout(timer);
            unsub();
            resolve();
          }
        });
      });
    },

    async promptAndWait(message, timeout = 300000) {
      const events = [];
      const done = new Promise((resolve, reject) => {
        const timer = setTimeout(() => { unsub(); reject(new Error("Pi RPC timeout")); }, timeout);
        const unsub = this.onEvent((event) => {
          events.push(event);
          if (event.type === "agent_end") {
            clearTimeout(timer);
            unsub();
            resolve(events);
          }
        });
      });
      await this.prompt(message);
      return done;
    },

    getStderr() { return stderr; },
  };
}
