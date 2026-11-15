import * as THREE from "three";
import { nearestNode, type CityMap } from "../city/city-map";
import { Search, pathMeters, type AlgorithmId } from "./search";

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

/** One side of a side-by-side comparison, updated live while it runs. */
export interface RunStats {
  algorithm: AlgorithmId;
  phase: "searching" | "tracing" | "done";
  found: boolean;
  meters: number;
  nodesExpanded: number;
  linesExplored: number;
  /** Time until this search finished (or so far, while it is searching). */
  seconds: number;
}

export interface Comparison {
  /** Changes with every run, so the UI can tell runs apart. */
  id: number;
  runs: [RunStats, RunStats];
  /** Lines both searches explored. */
  sharedLines: number;
  /** Lines both routes use. */
  sharedPathLines: number;
}

export interface VisualizerState {
  status: VisualizerStatus;
  start: MapPoint | null;
  end: MapPoint | null;
  result: SearchResult | null;
  comparison: Comparison | null;
}

export interface LineColors {
  map: string;
  search: string;
  path: string;
  /** First and second algorithm in a comparison. */
  compareA: string;
  compareB: string;
}

type Palette = Record<keyof LineColors, THREE.Color> & {
  pathA: THREE.Color;
  pathB: THREE.Color;
  pathBoth: THREE.Color;
};

// Per-line ownership bits during a comparison.
const EXPLORED = [1, 2] as const;
const ROUTE = [4, 8] as const;
const EXPLORED_BOTH = 3;
/** Both route bits; any of them set means the line is on a route. */
const ROUTE_BOTH = 12;

/** How often live comparison stats reach React while searches run. */
const PUBLISH_INTERVAL_MS = 100;

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
  private colors: Palette;
  /** Which comparison run explored or routed through each line; null outside comparisons. */
  private owner: Uint8Array | null = null;
  private runId = 0;

  private state: VisualizerState = {
    status: "idle",
    start: null,
    end: null,
    result: null,
    comparison: null,
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

  /**
   * Begins animating a search between the two points. No-op unless both are
   * placed and idle. With `compareWith`, runs both algorithms at once, layered
   * on the same map in their own colours.
   */
  start(algorithm: AlgorithmId, compareWith: AlgorithmId | null = null): boolean {
    const { status, start, end } = this.state;
    if (status !== "idle" || !start || !end) return false;
    if (compareWith && compareWith !== algorithm) {
      this.startComparison([algorithm, compareWith], start.node, end.node);
      return true;
    }

    const search = new Search(this.map, algorithm, start.node, end.node);
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
    this.owner = null;
    this.flush();
    const { status, result, comparison } = this.state;
    if (status !== "idle" || result || comparison) {
      this.setState({ status: "idle", result: null, comparison: null });
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

  // ── Comparison ───────────────────────────────────────────────────────────

  /**
   * Races two searches frame by frame, each expanding `speed` nodes per
   * frame, so the one that needs fewer expansions visibly finishes first.
   * Each traces its route as soon as it finishes.
   */
  private startComparison(algorithms: [AlgorithmId, AlgorithmId], start: number, goal: number): void {
    const owner = (this.owner = new Uint8Array(this.map.lineCount));
    const startedAt = performance.now();
    const explored: number[] = [];
    const runs = algorithms.map((algorithm) => ({
      search: new Search(this.map, algorithm, start, goal),
      route: [] as number[],
      drawn: 0,
      perFrame: 0,
      stats: {
        algorithm,
        phase: "searching",
        found: false,
        meters: 0,
        nodesExpanded: 0,
        linesExplored: 0,
        seconds: 0,
      } as RunStats,
    }));
    const id = ++this.runId;
    let sharedLines = 0;
    let sharedPathLines = 0;
    let lastPublish = -Infinity;

    const publish = () => {
      const phases = runs.map((run) => run.stats.phase);
      const status: VisualizerStatus = phases.includes("searching")
        ? "searching"
        : phases.includes("tracing")
          ? "tracing"
          : "done";
      this.setState({
        status,
        comparison: {
          id,
          runs: [{ ...runs[0].stats }, { ...runs[1].stats }],
          sharedLines,
          sharedPathLines,
        },
      });
    };

    const frame = (now: number) => {
      let phaseChanged = false;
      let drew = false;

      runs.forEach((run, side) => {
        const { search, stats } = run;
        const mine = EXPLORED[side];

        if (stats.phase === "searching") {
          explored.length = 0;
          for (let i = 0; i < this.speed && !search.done; i++) search.step(explored);
          for (const line of explored) {
            const bits = owner[line];
            if (bits & mine) continue;
            owner[line] = bits | mine;
            stats.linesExplored++;
            if (bits & EXPLORED[1 - side]) sharedLines++;
            this.paintOwned(line);
            drew = true;
          }
          stats.nodesExpanded = search.expanded;
          stats.seconds = (now - startedAt) / 1000;

          if (search.done) {
            run.route = search.path();
            stats.found = search.found;
            stats.meters = pathMeters(this.map, run.route);
            stats.phase = run.route.length > 0 ? "tracing" : "done";
            // Draw the route back from the goal, in about a second however long it is.
            run.perFrame = Math.max(2, Math.ceil(run.route.length / 60));
            phaseChanged = true;
          }
          return;
        }

        if (stats.phase === "tracing") {
          const until = Math.min(run.route.length, run.drawn + run.perFrame);
          for (let i = run.drawn; i < until; i++) {
            const line = run.route[i];
            const bits = owner[line];
            owner[line] = bits | ROUTE[side];
            if (bits & ROUTE[1 - side]) sharedPathLines++;
            this.paintOwned(line);
          }
          drew ||= until > run.drawn;
          run.drawn = until;
          if (run.drawn === run.route.length) {
            stats.phase = "done";
            phaseChanged = true;
          }
        }
      });

      if (drew) this.flush();
      const finished = runs.every((run) => run.stats.phase === "done");
      if (phaseChanged || finished || now - lastPublish >= PUBLISH_INTERVAL_MS) {
        lastPublish = now;
        publish();
      }
      if (!finished) this.frame = requestAnimationFrame(frame);
    };

    this.setState({ result: null });
    publish();
    this.frame = requestAnimationFrame(frame);
  }

  /** Paints a line by which comparison runs explored it or route through it. */
  private paintOwned(line: number): void {
    const bits = this.owner![line];
    const c = this.colors;
    if (bits & ROUTE_BOTH) {
      const color =
        (bits & ROUTE_BOTH) === ROUTE_BOTH ? c.pathBoth : bits & ROUTE[0] ? c.pathA : c.pathB;
      this.writeLine(line, "path", color);
    } else {
      const color =
        (bits & EXPLORED_BOTH) === EXPLORED_BOTH ? c.search : bits & EXPLORED[0] ? c.compareA : c.compareB;
      this.writeLine(line, "search", color);
    }
    this.painted.push(line);
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
  private writeLine(
    line: number,
    style: keyof typeof STYLE,
    color: THREE.Color = this.colors[style]
  ): void {
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

const WHITE = new THREE.Color("#ffffff");

function toColors(colors: LineColors): Palette {
  const compareA = new THREE.Color(colors.compareA);
  const compareB = new THREE.Color(colors.compareB);
  return {
    map: new THREE.Color(colors.map),
    search: new THREE.Color(colors.search),
    path: new THREE.Color(colors.path),
    compareA,
    compareB,
    // Routes are a lighter tint of their search colour so they stand out from it.
    pathA: compareA.clone().lerp(WHITE, 0.35),
    pathB: compareB.clone().lerp(WHITE, 0.35),
    pathBoth: WHITE.clone(),
  };
}
