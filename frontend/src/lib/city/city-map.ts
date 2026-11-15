import { haversineMeters, mercatorX, mercatorY } from "../geo";

/**
 * A city's road network: the graph the algorithms search and the line
 * segments the scene draws, as one set of flat typed arrays.
 *
 * Nodes and lines are identified by their index. Every line is one drawable
 * road segment *and* one undirected graph edge, so a search can report what
 * it explored as line indices and the renderer can paint them directly.
 *
 * Adjacency is stored CSR-style: the edges leaving node `n` occupy slots
 * `adjStart[n] .. adjStart[n + 1]` of `adjNode` (neighbour) and `adjLine`.
 */
export interface CityMap {
  readonly nodeCount: number;
  readonly lineCount: number;
  /** Scene position of each node: Mercator kilometres, centred on the city. */
  readonly nodeX: Float32Array;
  readonly nodeY: Float32Array;
  readonly nodeLat: Float64Array;
  readonly nodeLon: Float64Array;
  readonly lineFrom: Uint32Array;
  readonly lineTo: Uint32Array;
  readonly lineMeters: Float32Array;
  readonly adjStart: Uint32Array;
  readonly adjNode: Uint32Array;
  readonly adjLine: Uint32Array;
}

/** Accumulates OSM nodes and ways (in any order) and builds a `CityMap`. */
export class CityMapBuilder {
  private readonly indexById = new Map<number, number>();
  private readonly lats: number[] = [];
  private readonly lons: number[] = [];
  /** Flat list of OSM node-id pairs, one pair per road segment. */
  private readonly segments: number[] = [];

  addNode(id: number, lat: number, lon: number): void {
    if (this.indexById.has(id)) return;
    this.indexById.set(id, this.lats.length);
    this.lats.push(lat);
    this.lons.push(lon);
  }

  addWay(nodeIds: readonly number[]): void {
    for (let i = 0; i + 1 < nodeIds.length; i++) {
      if (nodeIds[i] !== nodeIds[i + 1]) {
        this.segments.push(nodeIds[i], nodeIds[i + 1]);
      }
    }
  }

  build(): CityMap {
    const nodeCount = this.lats.length;
    const nodeLat = Float64Array.from(this.lats);
    const nodeLon = Float64Array.from(this.lons);

    // Project in float64, centre on the mean, then narrow to float32 so the
    // GPU keeps sub-metre precision.
    const projX = new Float64Array(nodeCount);
    const projY = new Float64Array(nodeCount);
    let sumX = 0;
    let sumY = 0;
    for (let n = 0; n < nodeCount; n++) {
      sumX += projX[n] = mercatorX(nodeLon[n]);
      sumY += projY[n] = mercatorY(nodeLat[n]);
    }
    const centerX = nodeCount ? sumX / nodeCount : 0;
    const centerY = nodeCount ? sumY / nodeCount : 0;
    const nodeX = new Float32Array(nodeCount);
    const nodeY = new Float32Array(nodeCount);
    for (let n = 0; n < nodeCount; n++) {
      nodeX[n] = projX[n] - centerX;
      nodeY[n] = projY[n] - centerY;
    }

    // Resolve segments to node indices, dropping any that reference a node
    // the response did not include.
    const maxLines = this.segments.length / 2;
    const from = new Uint32Array(maxLines);
    const to = new Uint32Array(maxLines);
    const meters = new Float32Array(maxLines);
    const degree = new Uint32Array(nodeCount + 1);
    let lineCount = 0;
    for (let s = 0; s < this.segments.length; s += 2) {
      const a = this.indexById.get(this.segments[s]);
      const b = this.indexById.get(this.segments[s + 1]);
      if (a === undefined || b === undefined) continue;
      from[lineCount] = a;
      to[lineCount] = b;
      meters[lineCount] = haversineMeters(
        nodeLat[a],
        nodeLon[a],
        nodeLat[b],
        nodeLon[b]
      );
      degree[a]++;
      degree[b]++;
      lineCount++;
    }

    const adjStart = new Uint32Array(nodeCount + 1);
    for (let n = 0; n < nodeCount; n++) {
      adjStart[n + 1] = adjStart[n] + degree[n];
    }
    const adjNode = new Uint32Array(lineCount * 2);
    const adjLine = new Uint32Array(lineCount * 2);
    const cursor = adjStart.slice(0, nodeCount);
    for (let line = 0; line < lineCount; line++) {
      const a = from[line];
      const b = to[line];
      adjNode[cursor[a]] = b;
      adjLine[cursor[a]++] = line;
      adjNode[cursor[b]] = a;
      adjLine[cursor[b]++] = line;
    }

    return {
      nodeCount,
      lineCount,
      nodeX,
      nodeY,
      nodeLat,
      nodeLon,
      lineFrom: from.slice(0, lineCount),
      lineTo: to.slice(0, lineCount),
      lineMeters: meters.slice(0, lineCount),
      adjStart,
      adjNode,
      adjLine,
    };
  }
}

/** Index of the road node closest to a scene position, or -1 if none. */
export function nearestNode(map: CityMap, x: number, y: number): number {
  const { nodeX, nodeY, adjStart } = map;
  let best = -1;
  let bestDistance = Infinity;
  for (let n = 0; n < map.nodeCount; n++) {
    if (adjStart[n] === adjStart[n + 1]) continue; // not on any road
    const dx = nodeX[n] - x;
    const dy = nodeY[n] - y;
    const distance = dx * dx + dy * dy;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = n;
    }
  }
  return best;
}

/** The buffers to hand to `postMessage` so a map moves between threads without copying. */
export function cityMapTransferables(map: CityMap): ArrayBuffer[] {
  return [
    map.nodeX,
    map.nodeY,
    map.nodeLat,
    map.nodeLon,
    map.lineFrom,
    map.lineTo,
    map.lineMeters,
    map.adjStart,
    map.adjNode,
    map.adjLine,
  ].map((array) => array.buffer as ArrayBuffer);
}
