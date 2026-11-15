import type { CityMap } from "./city-map";
import type { LoadMessage, LoadRequest } from "./city.worker";

export interface LoadProgress {
  /** Decoded bytes received so far. */
  bytes: number;
  /** Total size when the server knows it (a cached city), otherwise null. */
  totalBytes: number | null;
}

export type OsmType = "relation" | "way";

export function isOsmType(value: string | null): value is OsmType {
  return value === "relation" || value === "way";
}

/**
 * Downloads a place's road network and builds its `CityMap`.
 *
 * All the heavy lifting (streaming, parsing, graph building) happens on a
 * worker thread, so the page stays responsive however large the city is.
 * Aborting `signal` cancels the download; the promise then never settles.
 */
export function loadCity(
  osmType: OsmType,
  osmId: number,
  options: { signal: AbortSignal; onProgress: (progress: LoadProgress) => void }
): Promise<CityMap> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./city.worker.ts", import.meta.url), {
      type: "module",
    });
    options.signal.addEventListener("abort", () => worker.terminate());

    worker.onmessage = ({ data }: MessageEvent<LoadMessage>) => {
      if (data.kind === "progress") {
        options.onProgress(data);
        return;
      }
      worker.terminate();
      if (data.kind === "done") resolve(data.map);
      else reject(new Error(data.message));
    };
    worker.onerror = () => {
      worker.terminate();
      reject(new Error("Could not load the map."));
    };

    const request: LoadRequest = { url: `/api/osm/${osmType}/${osmId}` };
    worker.postMessage(request);
  });
}
