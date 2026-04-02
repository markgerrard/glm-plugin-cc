/**
 * Argument parsing utilities for glm-companion.
 */

/**
 * Parse a raw argument string (as Claude Code passes it) into tokens.
 * Handles quoted strings and basic escaping.
 */
export function splitRawArgumentString(raw) {
  if (!raw) return [];
  const tokens = [];
  let current = "";
  let inQuote = null;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === "\\" && i + 1 < raw.length) {
      current += raw[++i];
      continue;
    }
    if (inQuote) {
      if (ch === inQuote) {
        inQuote = null;
      } else {
        current += ch;
      }
    } else if (ch === '"' || ch === "'") {
      inQuote = ch;
    } else if (/\s/.test(ch)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
    } else {
      current += ch;
    }
  }
  if (current) tokens.push(current);
  return tokens;
}

/**
 * Parse tokens into { flags, positional }.
 * Known flags:  --wait, --background, --model <val>, --scope <val>, --json, --file <val>
 */
export function parseArgs(argv) {
  const flags = {};
  const positional = [];
  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg === "--") {
      positional.push(...argv.slice(i + 1));
      break;
    }
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      // Boolean flags
      if (["wait", "background", "json", "yolo", "all", "web"].includes(key)) {
        flags[key] = true;
        i++;
        continue;
      }
      // Value flags
      if (["model", "scope", "file", "base", "kind", "resume", "focus"].includes(key) && i + 1 < argv.length) {
        flags[key] = argv[++i];
        i++;
        continue;
      }
      // Unknown flag — treat as positional
      positional.push(arg);
    } else {
      positional.push(arg);
    }
    i++;
  }
  return { flags, positional };
}
