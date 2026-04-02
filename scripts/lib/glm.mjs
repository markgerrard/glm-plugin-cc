/**
 * Core module: Zhipu AI GLM API client.
 * Wraps the /v4/chat/completions endpoint (OpenAI-compatible).
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const API_BASE = "https://open.bigmodel.cn/api/paas/v4";
const DEFAULT_TIMEOUT_MS = 120_000; // 2 minutes
const DEFAULT_MODEL = "glm-4-plus";

const MODEL_ALIASES = new Map([
  ["plus", "glm-4-plus"],
  ["flash", "glm-4-flash"],
  ["4", "glm-4"],
]);

/**
 * Resolve model aliases to full model IDs.
 */
export function normalizeRequestedModel(model) {
  if (!model) return DEFAULT_MODEL;
  return MODEL_ALIASES.get(model.toLowerCase()) ?? model;
}

/**
 * Get the API key from environment.
 */
function getApiKey() {
  const key = process.env.ZHIPU_API_KEY;
  if (!key) {
    throw new Error("ZHIPU_API_KEY environment variable is not set. Get your key at https://open.bigmodel.cn");
  }
  return key;
}

/**
 * Check if the Zhipu API is reachable and the key is valid.
 */
export async function getGlmAvailability() {
  try {
    const key = getApiKey();

    // Send a minimal completion as a health check
    const response = await fetch(`${API_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 1,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (response.ok || response.status === 200) {
      return { available: true, error: null };
    }

    const errorBody = await response.text().catch(() => "");
    return { available: false, error: `API returned ${response.status}: ${errorBody.slice(0, 200)}` };
  } catch (err) {
    if (err.message.includes("ZHIPU_API_KEY")) {
      return { available: false, error: err.message };
    }
    return { available: false, error: `Connection failed: ${err.message}` };
  }
}

/**
 * Send a request to the Zhipu GLM chat completions API.
 *
 * @param {string} prompt - The user prompt
 * @param {object} options
 * @param {string} [options.model] - Model override (or alias)
 * @param {number} [options.timeout] - Timeout in ms
 * @param {string} [options.systemPrompt] - System prompt
 * @param {number} [options.temperature] - Temperature (0-1)
 * @returns {Promise<{text: string, usage: object, exitCode: number}>}
 */
export async function runGlmPrompt(prompt, options = {}) {
  const {
    model,
    timeout = DEFAULT_TIMEOUT_MS,
    systemPrompt,
    temperature,
  } = options;

  const resolvedModel = normalizeRequestedModel(model);
  const apiKey = getApiKey();

  const messages = [];
  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }
  messages.push({ role: "user", content: prompt });

  const body = {
    model: resolvedModel,
    messages,
  };

  if (typeof temperature === "number") {
    body.temperature = temperature;
  }

  try {
    const response = await fetch(`${API_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeout),
    });

    const data = await response.json();

    if (!response.ok) {
      const errorMsg = data?.error?.message || data?.message || JSON.stringify(data);
      return {
        text: `GLM API Error (${response.status}): ${errorMsg}`,
        usage: null,
        exitCode: 1,
      };
    }

    // Extract text from OpenAI-compatible response
    const text =
      data?.choices?.[0]?.message?.content ??
      "(No text response)";

    return {
      text,
      usage: data.usage || null,
      exitCode: 0,
    };
  } catch (err) {
    if (err.name === "TimeoutError" || err.name === "AbortError") {
      return {
        text: `GLM API timed out after ${timeout}ms`,
        usage: null,
        exitCode: 1,
      };
    }
    return {
      text: `GLM API Error: ${err.message}`,
      usage: null,
      exitCode: 1,
    };
  }
}

/**
 * Load a prompt template from the prompts/ directory.
 */
export async function loadPromptTemplate(name) {
  const currentPath = fileURLToPath(import.meta.url);
  const dir = path.resolve(path.dirname(currentPath), "../../prompts");
  const filePath = path.join(dir, `${name}.md`);
  return readFile(filePath, "utf-8");
}

/**
 * Simple template interpolation: replaces {{key}} with values.
 */
export function interpolateTemplate(template, vars) {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{{${key}}}`, value ?? "");
  }
  return result;
}
