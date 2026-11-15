/// <reference lib="webworker" />
import { CityMapBuilder, cityMapTransferables, type CityMap } from "./city-map";
import { OverpassStreamParser } from "./overpass-stream";

export interface LoadRequest {
  url: string;
}

export type LoadMessage =
  | { kind: "progress"; bytes: number; totalBytes: number | null }
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
  let bytes = 0;
  let lastReport = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    parser.push(decoder.decode(value, { stream: true }));
    const now = performance.now();
    if (now - lastReport > 80) {
      lastReport = now;
      post({ kind: "progress", bytes, totalBytes });
    }
  }
  parser.push(decoder.decode());
  parser.finish();
  post({ kind: "progress", bytes, totalBytes: bytes });

  const map = builder.build();
  if (map.lineCount === 0) {
    throw new Error("No roads were found for this place.");
  }
  return map;
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
