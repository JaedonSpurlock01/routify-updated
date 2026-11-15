/// <reference lib="webworker" />
import { CityMapBuilder, cityMapTransferables, type CityMap } from "./city-map";
import { OverpassStreamParser } from "./overpass-stream";

export interface LoadRequest {
  url: string;
}

export type LoadProgress =
  /** The server is still querying OpenStreetMap; sent with each heartbeat. */
  | { stage: "waiting" }
  | {
      stage: "downloading";
      /** Decoded bytes received so far. */
      bytes: number;
      /** Total size when the server knows it (a cached city), otherwise null. */
      totalBytes: number | null;
      /** Recent download speed, once there is enough to measure. */
      bytesPerSecond: number | null;
    }
  | { stage: "building" };

export type LoadMessage =
  | { kind: "progress"; progress: LoadProgress }
  | { kind: "done"; map: CityMap }
  | { kind: "error"; message: string };

const post = (message: LoadMessage, transfer: Transferable[] = []) =>
  (self as DedicatedWorkerGlobalScope).postMessage(message, transfer);

async function load({ url }: LoadRequest): Promise<CityMap> {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(body?.error ?? `Request failed (${response.status}).`);
  }

  // The edge may compress the body, so Content-Length (when present at all)
  // would not match the decoded bytes we count; the API reports the real size.
  const total = Number(response.headers.get("X-Uncompressed-Length"));
  const totalBytes = Number.isFinite(total) && total > 0 ? total : null;

  const builder = new CityMapBuilder();
  const parser = new OverpassStreamParser((element) => {
    if (element.type === "node" && "lat" in element) {
      builder.addNode(element.id, element.lat, element.lon);
    } else if (element.type === "way" && "nodes" in element) {
      builder.addWay(element.nodes);
    }
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const progress = (progress: LoadProgress) => post({ kind: "progress", progress });
  const speed = new SpeedMeter();
  let receiving = false;
  let bytes = 0;
  let lastReport = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!receiving && isBlank(value)) {
      progress({ stage: "waiting" });
      continue;
    }
    receiving = true;
    bytes += value.byteLength;
    parser.push(decoder.decode(value, { stream: true }));
    const now = performance.now();
    speed.sample(now, bytes);
    if (now - lastReport > 80) {
      lastReport = now;
      progress({ stage: "downloading", bytes, totalBytes, bytesPerSecond: speed.rate() });
    }
  }
  parser.push(decoder.decode());
  parser.finish();
  progress({ stage: "building" });

  const map = builder.build();
  if (map.lineCount === 0) {
    throw new Error("No roads were found for this place.");
  }
  return map;
}

/** True for a chunk of only whitespace: a heartbeat from the API. */
function isBlank(chunk: Uint8Array): boolean {
  for (const byte of chunk) {
    if (byte !== 32 && byte !== 10 && byte !== 13 && byte !== 9) return false;
  }
  return true;
}

/** Download speed over roughly the last two seconds. */
class SpeedMeter {
  private samples: { time: number; bytes: number }[] = [];

  sample(time: number, bytes: number): void {
    this.samples.push({ time, bytes });
    while (this.samples.length > 2 && time - this.samples[1].time > 2000) {
      this.samples.shift();
    }
  }

  rate(): number | null {
    const first = this.samples[0];
    const last = this.samples[this.samples.length - 1];
    const seconds = (last.time - first.time) / 1000;
    return seconds >= 0.5 ? (last.bytes - first.bytes) / seconds : null;
  }
}

self.onmessage = (event: MessageEvent<LoadRequest>) => {
  load(event.data).then(
    (map) => post({ kind: "done", map }, cityMapTransferables(map)),
    (error: unknown) =>
      post({
        kind: "error",
        message:
          error instanceof Error ? error.message : "Something went wrong.",
      })
  );
};
