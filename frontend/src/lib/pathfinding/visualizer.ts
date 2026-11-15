import * as THREE from "three";
import { nearestNode, type CityMap } from "../city/city-map";
import { createSearch, pathMeters, type AlgorithmId } from "./search";

export type VisualizerStatus = "idle" | "searching" | "tracing" | "done";

export interface MapPoint {
  node: number;
  x: number;
  y: number;
}

export interface SearchResult {
  found: boolean;
  meters: number;
  /** Wall-clock time the search animation took. */
  seconds: number;
}

export interface VisualizerState {
  status: VisualizerStatus;
  start: MapPoint | null;
  end: MapPoint | null;
  result: SearchResult | null;
}

export interface LineColors {
  map: string;
  search: string;
  path: string;
}

const STYLE = {
  map: { width: 0.01, z: 0 },
  search: { width: 0.025, z: 0.001 },
  path: { width: 0.05, z: 0.008 },
} as const;

/** Past this many dirty ranges a single full-buffer upload is cheaper. */
const MAX_UPDATE_RANGES = 512;

/**
 * Draws a city and animates pathfinding over it.
 *
 * Owns the instanced mesh for the road network (add `mesh` to a scene), the
 * start/end points, and the search animation loop. React only needs to
 * forward input (`placePoint`, `start`, `stop`, …) and render `getState()`,
 * via `subscribe`.
 */
export class Visualizer {
  readonly mesh: THREE.InstancedMesh;
  /** Nodes expanded per animation frame. */
  speed = 30;
  /** Called whenever the mesh changed and the scene needs another frame. */
  onInvalidate: (() => void) | null = null;

  private readonly map: CityMap;
  private readonly matrices: THREE.InstancedBufferAttribute;
  private readonly colorsAttr: THREE.InstancedBufferAttribute;
  private colors: Record<keyof LineColors, THREE.Color>;

  private state: VisualizerState = {
    status: "idle",
    start: null,
    end: null,
    result: null,
  };
  private readonly listeners = new Set<() => void>();

  private painted: number[] = [];
  private frame = 0;
  /** True while the next GPU upload is already going to send the whole buffer. */
  private fullUpload = true;

  constructor(map: CityMap, colors: LineColors) {
    this.map = map;
    this.colors = toColors(colors);

    const geometry = new THREE.PlaneGeometry(1, 1).translate(0.5, 0, 0);
    const material = new THREE.MeshBasicMaterial({
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    this.mesh = new THREE.InstancedMesh(geometry, material, map.lineCount);
    this.mesh.frustumCulled = false;
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(map.lineCount * 3),
      3
    );
    this.matrices = this.mesh.instanceMatrix;
    this.colorsAttr = this.mesh.instanceColor;
    this.matrices.setUsage(THREE.DynamicDrawUsage);
    this.colorsAttr.setUsage(THREE.DynamicDrawUsage);
    this.matrices.onUpload(() => {
      this.fullUpload = false;
    });

    this.paintWholeMap();
  }

  // ── State ────────────────────────────────────────────────────────────────

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getState = (): VisualizerState => this.state;

  // ── Input ────────────────────────────────────────────────────────────────

  /**
   * Snaps a scene position to the nearest road and makes it the start point,
   * or the end point if a start exists. Returns which one was placed, or
   * null when both are already set or a search is on screen.
   */
  placePoint(x: number, y: number): "start" | "end" | null {
    const { status, start, end } = this.state;
    if (status !== "idle" || (start && end)) return null;
    const node = nearestNode(this.map, x, y);
    if (node === -1) return null;
    const point = { node, x: this.map.nodeX[node], y: this.map.nodeY[node] };
    if (!start) {
      this.setState({ start: point });
      return "start";
    }
    this.setState({ end: point });
    return "end";
  }

  /** Removes both points (and anything a search drew). */
  clearPoints(): void {
    this.stop();
    this.setState({ start: null, end: null });
  }

  /** Begins animating a search between the two points. No-op unless both are placed and idle. */
  start(algorithm: AlgorithmId): boolean {
    const { status, start, end } = this.state;
    if (status !== "idle" || !start || !end) return false;

    const search = createSearch(this.map, algorithm, start.node, end.node);
    const startedAt = performance.now();
    const explored: number[] = [];
    this.setState({ status: "searching", result: null });

    const searchFrame = () => {
      explored.length = 0;
      for (let i = 0; i < this.speed && !search.done; i++) search.step(explored);
      this.paint(explored, 0, explored.length, "search");

      if (!search.done) {
        this.frame = requestAnimationFrame(searchFrame);
        return;
      }

      const path = search.path();
      const result: SearchResult = {
        found: search.found,
        meters: pathMeters(this.map, path),
        seconds: (performance.now() - startedAt) / 1000,
      };
      if (path.length === 0) {
        this.setState({ status: "done", result });
        return;
      }

      // Draw the route back from the goal, in about a second however long it is.
      this.setState({ status: "tracing", result });
      const perFrame = Math.max(2, Math.ceil(path.length / 60));
      let drawn = 0;
      const traceFrame = () => {
        const until = Math.min(path.length, drawn + perFrame);
        this.paint(path, drawn, until, "path");
        drawn = until;
        if (drawn < path.length) {
          this.frame = requestAnimationFrame(traceFrame);
        } else {
          this.setState({ status: "done" });
        }
      };
      this.frame = requestAnimationFrame(traceFrame);
    };

    this.frame = requestAnimationFrame(searchFrame);
    return true;
  }

  /** Cancels any search and erases what it drew. The points stay. */
  stop(): void {
    cancelAnimationFrame(this.frame);
    for (const line of this.painted) this.writeLine(line, "map");
    this.painted = [];
    this.flush();
    if (this.state.status !== "idle" || this.state.result) {
      this.setState({ status: "idle", result: null });
    }
  }

  /** Recolours the map. Search and path colours apply from the next search. */
  setColors(colors: LineColors): void {
    const next = toColors(colors);
    const mapChanged = !next.map.equals(this.colors.map);
    this.colors = next;
    if (mapChanged) this.paintWholeMap();
  }

  dispose(): void {
    cancelAnimationFrame(this.frame);
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }

  // ── Painting ─────────────────────────────────────────────────────────────

  private paint(lines: readonly number[], from: number, to: number, style: "search" | "path"): void {
    for (let i = from; i < to; i++) {
      this.writeLine(lines[i], style);
      this.painted.push(lines[i]);
    }
    if (to > from) this.flush();
  }

  /** Paints every line in the map colour, leaving an on-screen search untouched. */
  private paintWholeMap(): void {
    this.uploadEverything();
    const searched = new Set(this.painted);
    for (let line = 0; line < this.map.lineCount; line++) {
      if (!searched.has(line)) this.writeLine(line, "map");
    }
    this.flush();
  }

  private uploadEverything(): void {
    this.matrices.clearUpdateRanges();
    this.colorsAttr.clearUpdateRanges();
    this.fullUpload = true;
  }

  /** Writes one line's instance transform and colour straight into the GPU buffers. */
  private writeLine(line: number, style: keyof typeof STYLE): void {
    const { nodeX, nodeY, lineFrom, lineTo } = this.map;
    const { width, z } = STYLE[style];
    const from = lineFrom[line];
    const to = lineTo[line];
    const dx = nodeX[to] - nodeX[from];
    const dy = nodeY[to] - nodeY[from];
    const scale = width / (Math.hypot(dx, dy) || 1);

    // Column-major: X axis along the segment, Y axis across it, then position.
    const m = this.matrices.array;
    const o = line * 16;
    m[o] = dx;
    m[o + 1] = dy;
    m[o + 4] = -dy * scale;
    m[o + 5] = dx * scale;
    m[o + 10] = 1;
    m[o + 12] = nodeX[from];
    m[o + 13] = nodeY[from];
    m[o + 14] = z;
    m[o + 15] = 1;

    const color = this.colors[style];
    const c = this.colorsAttr.array;
    c[line * 3] = color.r;
    c[line * 3 + 1] = color.g;
    c[line * 3 + 2] = color.b;

    // Upload only what changed: a full upload is tens of megabytes per frame
    // on a big city. Past a point, though, one big upload beats many small ones.
    if (this.fullUpload) return;
    if (this.matrices.updateRanges.length >= MAX_UPDATE_RANGES) {
      this.uploadEverything();
      return;
    }
    this.matrices.addUpdateRange(o, 16);
    this.colorsAttr.addUpdateRange(line * 3, 3);
  }

  private flush(): void {
    this.matrices.needsUpdate = true;
    this.colorsAttr.needsUpdate = true;
    this.onInvalidate?.();
  }

  private setState(patch: Partial<VisualizerState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
}

function toColors(colors: LineColors): Record<keyof LineColors, THREE.Color> {
  return {
    map: new THREE.Color(colors.map),
    search: new THREE.Color(colors.search),
    path: new THREE.Color(colors.path),
  };
}
