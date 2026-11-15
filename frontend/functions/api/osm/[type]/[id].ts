/**
 * GET /api/osm/:type/:id — the road network of an OSM relation or way, as
 * Overpass JSON.
 *
 * Cities are cached in R2. On a miss the Overpass response is streamed to the
 * visitor and into R2 at the same time, so the first visitor waits no longer
 * than Overpass itself takes and everyone after them gets the cached copy.
 */

interface Env {
  CITIES: R2Bucket;
  /** Optional comma-separated list of Overpass endpoints to use instead of the public ones. */
  OVERPASS_URLS?: string;
}

/** Tried in order; the next one is used when an endpoint is busy or down. */
const DEFAULT_OVERPASS_URLS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

const BUSY_STATUSES = new Set([429, 502, 503, 504]);

/** Overpass derives area ids from the id of the relation/way they were built from. */
const AREA_ID_OFFSET: Record<string, number> = {
  relation: 3_600_000_000,
  way: 2_400_000_000,
};

const ROAD_FILTER =
  "[highway~'^(((motorway|trunk|primary|secondary|tertiary)(_link)?)|unclassified|residential|living_street|pedestrian|service|track)$'][area!=yes]";

/** R2 multipart uploads need every part except the last to be the same size. */
const PART_SIZE = 8 * 1024 * 1024;

/** Sent while Overpass is still working, so the visitor knows we're alive. */
const HEARTBEAT = new TextEncoder().encode(" ");
const HEARTBEAT_INTERVAL_MS = 2000;

/** Anything smaller is an empty or error document, not a city worth caching. */
const MIN_CACHEABLE_BYTES = 1024;

export const onRequestGet: PagesFunction<Env, "type" | "id"> = async ({
  params,
  env,
  waitUntil,
}) => {
  const type = String(params.type);
  const id = Number(params.id);
  if (!(type in AREA_ID_OFFSET) || !Number.isSafeInteger(id) || id <= 0) {
    return error(400, "Only OSM relations and ways with a boundary can be loaded.");
  }

  const key = `v1/${type}/${id}.json`;

  const cached = await env.CITIES.get(key);
  if (cached) {
    return new Response(cached.body, {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=86400",
        "X-Uncompressed-Length": String(cached.size),
        "X-Cache": "HIT",
      },
    });
  }

  const areaId = id + AREA_ID_OFFSET[type];
  const query = `[timeout:900][maxsize:1073741824][out:json];area(${areaId});(._;)->.area;(way${ROAD_FILTER}(area.area);node(w););out skel;`;

  const endpoints =
    env.OVERPASS_URLS?.split(",").map((url) => url.trim()).filter(Boolean) ??
    DEFAULT_OVERPASS_URLS;

  // Overpass sends nothing until it has run the whole query, which takes
  // minutes for a big city. So the response starts right away and stays alive
  // with whitespace heartbeats (legal before a JSON document) until the data
  // flows; that is how the visitor can tell the server is still working.
  // Once the status line is out, failures are reported as `{"error": "..."}`.
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const client = writable.getWriter();
  waitUntil(
    queryOverpass(endpoints, query, client).then(
      (body) => body && relayAndCache(body, client, env.CITIES, key)
    )
  );

  return new Response(readable, {
    headers: {
      "Content-Type": "application/json",
      // Left uncompressed: a compressor would sit on the heartbeats until it
      // had a full block to send. Only this first, uncached download pays.
      "Cache-Control": "no-store, no-transform",
      "Content-Encoding": "identity",
      "X-Cache": "MISS",
    },
  });
};

/**
 * Runs the query against each endpoint in turn, heartbeating to `client` while
 * it waits. Resolves with the Overpass body, or null after writing the error.
 */
async function queryOverpass(
  endpoints: string[],
  query: string,
  client: WritableStreamDefaultWriter<Uint8Array>
): Promise<ReadableStream<Uint8Array> | null> {
  // Writes queue in order, so a beat still pending when the data starts is harmless.
  const beat = () => client.write(HEARTBEAT).catch(() => {});
  beat();
  const timer = setInterval(beat, HEARTBEAT_INTERVAL_MS);

  try {
    let upstream: Response | null = null;
    for (const endpoint of endpoints) {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "User-Agent": "Routify (city pathfinding visualizer)" },
        body: new URLSearchParams({ data: query }),
      }).catch(() => null);
      if (response && !BUSY_STATUSES.has(response.status)) {
        upstream = response;
        break;
      }
      await response?.body?.cancel();
    }

    if (!upstream) {
      return fail(client, "The map server is busy right now. Please try again in a minute.");
    }
    const isJson = upstream.headers.get("Content-Type")?.includes("json");
    if (!upstream.ok || !upstream.body || !isJson) {
      await upstream.body?.cancel();
      return fail(client, `The map server returned an error (${upstream.status}).`);
    }
    return upstream.body;
  } finally {
    clearInterval(timer);
  }
}

async function fail(
  client: WritableStreamDefaultWriter<Uint8Array>,
  message: string
): Promise<null> {
  const body = new TextEncoder().encode(JSON.stringify({ error: message }));
  await client.write(body).catch(() => {});
  await client.close().catch(() => {});
  return null;
}

/**
 * Copies `source` to the visitor and to R2. A visitor who disconnects does not
 * stop the upload; a broken or error-carrying Overpass response is never cached.
 */
async function relayAndCache(
  source: ReadableStream<Uint8Array>,
  writer: WritableStreamDefaultWriter<Uint8Array>,
  bucket: R2Bucket,
  key: string
): Promise<void> {
  const reader = source.getReader();
  let clientConnected = true;

  const upload = await bucket.createMultipartUpload(key, {
    httpMetadata: { contentType: "application/json" },
  });
  const parts: R2UploadedPart[] = [];
  let part = new Uint8Array(PART_SIZE);
  let filled = 0;
  let total = 0;
  let tail = new Uint8Array(0);

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      if (clientConnected) {
        try {
          await writer.write(value);
        } catch {
          clientConnected = false;
        }
      }

      total += value.byteLength;
      tail = lastBytes(tail, value, 2048);

      let offset = 0;
      while (offset < value.byteLength) {
        const take = Math.min(PART_SIZE - filled, value.byteLength - offset);
        part.set(value.subarray(offset, offset + take), filled);
        filled += take;
        offset += take;
        if (filled === PART_SIZE) {
          parts.push(await upload.uploadPart(parts.length + 1, part));
          part = new Uint8Array(PART_SIZE);
          filled = 0;
        }
      }
    }

    if (clientConnected) await writer.close().catch(() => {});

    const ending = new TextDecoder().decode(tail);
    const complete =
      total >= MIN_CACHEABLE_BYTES &&
      ending.trimEnd().endsWith("}") &&
      !ending.includes('"remark"');
    if (!complete) {
      await upload.abort();
      return;
    }

    if (filled > 0) {
      parts.push(await upload.uploadPart(parts.length + 1, part.subarray(0, filled)));
    }
    await upload.complete(parts);
  } catch (cause) {
    await writer.abort(cause).catch(() => {});
    await upload.abort().catch(() => {});
  }
}

function lastBytes(previous: Uint8Array, chunk: Uint8Array, count: number): Uint8Array {
  if (chunk.byteLength >= count) return chunk.slice(-count);
  const joined = new Uint8Array(previous.byteLength + chunk.byteLength);
  joined.set(previous);
  joined.set(chunk, previous.byteLength);
  return joined.slice(-count);
}

function error(status: number, message: string): Response {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}
