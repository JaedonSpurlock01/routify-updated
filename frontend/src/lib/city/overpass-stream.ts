export type OverpassElement =
  | { type: "node"; id: number; lat: number; lon: number }
  | { type: "way"; id: number; nodes: number[] }
  | { type: string; id: number };

const QUOTE = 34; // "
const BACKSLASH = 92; // \
const OPEN_BRACE = 123; // {
const CLOSE_BRACE = 125; // }
const CLOSE_BRACKET = 93; // ]

const Phase = { Head: 0, Elements: 1, Tail: 2 } as const;
type Phase = (typeof Phase)[keyof typeof Phase];

/**
 * Incremental parser for an Overpass `[out:json]` response.
 *
 * Feed it decoded text with `push` as it arrives off the network; it calls
 * `onElement` for every entry of the top-level `elements` array without ever
 * holding the whole document in memory. Call `finish` once the stream ends —
 * it throws if the document was cut short or Overpass appended an error
 * `remark` (which it does, with HTTP 200, on timeouts and memory limits).
 */
export class OverpassStreamParser {
  private phase: Phase = Phase.Head;
  private buf = "";
  private scanFrom = 0;
  private depth = 0;
  private inString = false;
  private escaped = false;
  private elementStart = 0;
  private tail = "";
  private readonly onElement: (element: OverpassElement) => void;

  constructor(onElement: (element: OverpassElement) => void) {
    this.onElement = onElement;
  }

  push(text: string): void {
    if (this.phase === Phase.Tail) {
      this.tail = (this.tail + text).slice(-4096);
      return;
    }

    this.buf += text;

    if (this.phase === Phase.Head) {
      const key = this.buf.indexOf('"elements"');
      const open = key === -1 ? -1 : this.buf.indexOf("[", key);
      if (open === -1) return; // keep buffering the (tiny) header
      this.buf = this.buf.slice(open + 1);
      this.scanFrom = 0;
      this.phase = Phase.Elements;
    }

    this.scanElements();
  }

  finish(): void {
    if (this.phase === Phase.Head) {
      throw new Error(
        remarkIn(this.buf) ?? "The map server returned an unexpected response."
      );
    }
    if (this.phase === Phase.Elements) {
      throw new Error("The download was cut short. Please try again.");
    }
    const remark = remarkIn(this.tail);
    if (remark) throw new Error(remark);
  }

  private scanElements(): void {
    const buf = this.buf;
    let { depth, inString, escaped, elementStart } = this;
    let i = this.scanFrom;

    for (; i < buf.length; i++) {
      const c = buf.charCodeAt(i);

      if (inString) {
        if (escaped) escaped = false;
        else if (c === BACKSLASH) escaped = true;
        else if (c === QUOTE) inString = false;
        continue;
      }

      if (c === QUOTE) {
        inString = true;
      } else if (c === OPEN_BRACE) {
        if (depth === 0) elementStart = i;
        depth++;
      } else if (c === CLOSE_BRACE) {
        depth--;
        if (depth === 0) {
          this.onElement(JSON.parse(buf.slice(elementStart, i + 1)));
          elementStart = i + 1;
        }
      } else if (c === CLOSE_BRACKET && depth === 0) {
        this.phase = Phase.Tail;
        this.tail = buf.slice(i + 1);
        this.buf = "";
        return;
      }
    }

    // Keep only the unfinished element (if any) for the next chunk.
    const keepFrom = depth > 0 ? elementStart : buf.length;
    this.buf = buf.slice(keepFrom);
    this.scanFrom = this.buf.length;
    this.elementStart = 0;
    this.depth = depth;
    this.inString = inString;
    this.escaped = escaped;
  }
}

function remarkIn(text: string): string | null {
  const match = /"remark"\s*:\s*("(?:[^"\\]|\\.)*")/.exec(text);
  if (!match) return null;
  const remark = JSON.parse(match[1]) as string;
  if (/timed out|timeout/i.test(remark)) {
    return "The map server timed out building this place. Try a smaller area.";
  }
  if (/out of memory/i.test(remark)) {
    return "This place is too large for the map server. Try a smaller area.";
  }
  return `Map server error: ${remark}`;
}
