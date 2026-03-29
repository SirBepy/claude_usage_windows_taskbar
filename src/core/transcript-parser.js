"use strict";

const fs = require("fs");
const readline = require("readline");

const ZERO = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, turns: 0 };

/**
 * Stream a Claude transcript JSONL file and sum token usage from all assistant turns.
 *
 * @param {string} filePath  Absolute path to a .jsonl transcript file.
 * @returns {Promise<{inputTokens:number, outputTokens:number, cacheReadTokens:number, cacheCreationTokens:number, turns:number}>}
 */
function parseTranscript(filePath) {
  return new Promise((resolve) => {
    if (!fs.existsSync(filePath)) return resolve({ ...ZERO });

    const acc = { ...ZERO };

    let stream;
    try {
      stream = fs.createReadStream(filePath, { encoding: "utf8" });
    } catch {
      return resolve({ ...ZERO });
    }

    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    rl.on("line", (line) => {
      if (!line.trim()) return;
      let entry;
      try { entry = JSON.parse(line); } catch { return; }

      if (!entry || entry.type !== "assistant") return;

      const usage = entry.message?.usage ?? entry.usage;
      if (!usage) return;

      acc.inputTokens += usage.input_tokens ?? 0;
      acc.outputTokens += usage.output_tokens ?? 0;
      acc.cacheReadTokens += usage.cache_read_input_tokens ?? 0;
      acc.cacheCreationTokens += usage.cache_creation_input_tokens ?? 0;
      acc.turns += 1;
    });

    rl.on("close", () => resolve(acc));
    rl.on("error", () => resolve(acc));
    stream.on("error", () => { rl.close(); resolve(acc); });
  });
}

module.exports = { parseTranscript };
