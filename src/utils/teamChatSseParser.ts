/** Incremental UTF-8 SSE event parser (fetch ReadableStream chunks). */

export type SseJsonHandler = (payload: unknown) => void;

/**
 * Parse Server-Sent Events from arbitrarily split UTF-8 text chunks.
 * - Ignores comment/heartbeat lines (`: ...`)
 * - Joins multiple `data:` lines with `\n` per SSE spec
 * - Malformed JSON does not throw; skipped via onMalformed
 */
export class SseJsonStreamParser {
  private buffer = "";

  constructor(
    private readonly onEvent: SseJsonHandler,
    private readonly onMalformed?: (raw: string) => void,
  ) {}

  push(chunk: string) {
    if (!chunk) return;
    this.buffer += chunk;
    // Normalize CR LF while keeping incomplete trailing frame in buffer
    this.buffer = this.buffer.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

    while (true) {
      const sep = this.buffer.indexOf("\n\n");
      if (sep < 0) break;
      const frame = this.buffer.slice(0, sep);
      this.buffer = this.buffer.slice(sep + 2);
      this.consumeFrame(frame);
    }
  }

  private consumeFrame(frame: string) {
    if (!frame.trim()) return;
    const dataLines: string[] = [];
    for (const line of frame.split("\n")) {
      if (!line || line.startsWith(":")) continue;
      if (line.startsWith("data:")) {
        // Optional single space after colon
        dataLines.push(line.slice(5).startsWith(" ") ? line.slice(6) : line.slice(5));
      }
    }
    if (dataLines.length === 0) return;
    const raw = dataLines.join("\n");
    if (!raw.trim()) return;
    try {
      this.onEvent(JSON.parse(raw));
    } catch {
      this.onMalformed?.(raw);
    }
  }

  reset() {
    this.buffer = "";
  }
}

export function computeSseRetryDelayMs(attempt: number, options?: {
  initialMs?: number;
  maxMs?: number;
  random?: () => number;
}) {
  const initialMs = options?.initialMs ?? 400;
  const maxMs = options?.maxMs ?? 10_000;
  const random = options?.random ?? Math.random;
  const exp = Math.min(maxMs, Math.round(initialMs * Math.pow(1.7, Math.max(0, attempt))));
  const jitter = Math.floor(random() * Math.min(250, exp * 0.2));
  return Math.min(maxMs, exp + jitter);
}
