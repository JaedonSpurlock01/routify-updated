import * as THREE from "three";
import { nearestNode, type CityMap } from "../city/city-map";
import { RouteRibbon } from "./route-ribbon";
import { runSearch, type AlgorithmId, type Trace } from "./search";

export type VisualizerStatus = "idle" | "searching" | "tracing" | "done";

export interface MapPoint {
  node: number;
  x: number;
  y: number;
}

export interface SearchResult {
  found: boolean;
  meters: number;
  /** Time the search itself took to compute. */
  computeMs: number;
}

/** One side of a side-by-side comparison, updated live while it runs. */
export interface RunStats {
  algorithm: AlgorithmId;
  phase: "searching" | "tracing" | "done";
  found: boolean;
  meters: number;
  nodesExpanded: number;
  linesExplored: number;
  /**
   * Time the search itself took to compute. Known from the start; the UI
   * should hold it back until the run's playback leaves "searching".
   */
  computeMs: number;
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
  /** Playback is held part-way; nothing advances until it resumes. */
  paused: boolean;
  start: MapPoint | null;
  end: MapPoint | null;
  result: SearchResult | null;
  comparison: Comparison | null;
}

/** Where playback has got to, for the timeline. Changes every frame while playing. */
export interface PlaybackProgress {
  /** Expansions drawn so far. */
  cursor: number;
  /** Where the cursor ends: the longest trace's expansions. */
  length: number;
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

/** One trace being played back, and how much of its route is on screen. */
interface Run {
  trace: Trace;
  /** Route lines drawn so far, and how long the route has been drawing. */
  routeShown: number;
  routeMs: number;
  /** The route, drawn as one smooth ribbon; null when there is none. */
  ribbon: RouteRibbon | null;
  stats: RunStats;
}

/**
 * Every line playback draws in the explored overlay, in the order it first
 * appears. Overlay slot `s` always holds `lines[s]`, whatever the cursor, so
 * moving the cursor back only shortens the overlay and moving it forward
 * again reuses what is already on the GPU.
 */
interface Reveal {
  lines: Int32Array;
  /** Overlay slots in use after `k` expansions, for k = 0 … length. */
  slotsAt: Int32Array;
  /** Comparisons only: which run explored each slot's line first. */
  side: Uint8Array | null;
  /** Comparisons only: the expansion at which the other run also explored it, or NEVER. */
  bothAt: Int32Array | null;
  /** Comparisons only: slots both runs explored, in the order the second run got there. */
  shared: Int32Array | null;
  /** Comparisons only: how many of `shared` both runs had explored after `k` expansions. */
  sharedAt: Int32Array | null;
}

/** Everything about the traces on screen. */
interface Playback {
  id: number;
  runs: Run[];
  reveal: Reveal;
  /** The longest trace's expansions: where the cursor ends. */
  length: number;
  /** Expansions played so far; fractional between frames. */
  cursor: number;
  /** Whole expansions currently drawn. */
  drawn: number;
  /** Colours as they were when the search started. */
  colors: Palette;
  comparing: boolean;
  /** Route-line index pairs (first run, second run) for lines both routes use. */
  routePairs: Int32Array;
  /** Whether each pair is currently drawn by both routes. */
  pairShown: Uint8Array;
  sharedPathLines: number;
  /** A single run's result, revealed once its search has played out. */
  result: SearchResult;
  /** Time of the last frame, or null when the next frame is the first since (re)starting. */
  last: number | null;
  lastPublish: number;
}

const NEVER = 0x7fffffff;

/** How often live comparison stats reach React while searches run. */
const PUBLISH_INTERVAL_MS = 100;

/** Playback speed in expansions per second; Infinity draws a whole trace at once. */
export const DEFAULT_SPEED = 1800;
/** How long a route takes to draw, however long it is. */
const ROUTE_MS = 1000;
/** Assumed length of the first frame, and the most one frame may advance. */
const FRAME_MS = 1000 / 60;
const MAX_FRAME_MS = 100;

const STYLE = {
  map: { width: 0.01, z: 0 },
  search: { width: 0.025, z: 0.001 },
} as const;

/** Routes are ribbons drawn above the roads; a second compared route sits just above the first. */
const ROUTE_WIDTH = 0.05;
const ROUTE_Z = [0.008, 0.009] as const;

/** Smallest explored-line overlay worth allocating, in lines. */
const MIN_EXPLORED_CAPACITY = 4096;
/** Past this many recoloured lines in a frame, one span upload beats one call per line. */
const MAX_RECOLOUR_RANGES = 32;

/**
 * Draws a city and plays pathfinding back over it.
 *
 * Owns the instanced mesh for the road network (add `mesh` to a scene), the
 * start/end points, and playback. A search runs to completion the moment it
 * starts; what animates is its trace, so playback can pause, skip to the end
 * or jump to any cursor without searching again. React only needs to forward
 * input (`placePoint`, `start`, `pause`, `seek`, …) and render `getState()`,
 * via `subscribe`, and `getProgress()`, via `subscribeProgress`.
 */
export class Visualizer {
  /** Everything the visualizer draws: add this to a scene. */
  readonly object = new THREE.Group();
  /** The road network, one instance per line. Only repainted when its colour changes. */
  readonly mesh: THREE.InstancedMesh;
  /** Playback speed in expansions per second; Infinity is instant. Read every frame. */
  speed = DEFAULT_SPEED;
  /** Called whenever the mesh changed and the scene needs another frame. */
  onInvalidate: (() => void) | null = null;

  private readonly map: CityMap;
  private colors: Palette;
  private runId = 0;
  private playback: Playback | null = null;
  /** Whether a frame is scheduled. */
  private playing = false;

  /**
   * Explored lines, drawn over the road network in reveal order, so each
   * frame uploads one contiguous run of new instances instead of scattered
   * writes into the (much larger) road network buffers. Allocated by the
   * first search that needs it, and only reallocated when a search explores
   * more lines than it holds.
   */
  private explored: THREE.InstancedMesh | null = null;
  /** Overlay slots written on the CPU; may run past `count` after moving the cursor back. */
  private written = 0;
  /** First overlay slot not yet sent to the GPU. */
  private uploadedTo = 0;
  /** Already-uploaded overlay slots recoloured since the last upload. */
  private recoloured: number[] = [];

  private state: VisualizerState = {
    status: "idle",
    paused: false,
    start: null,
    end: null,
    result: null,
    comparison: null,
  };
  private readonly listeners = new Set<() => void>();
  private progress: PlaybackProgress | null = null;
  private readonly progressListeners = new Set<() => void>();

  private ribbons: RouteRibbon[] = [];
  private readonly ribbonMaterial = new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  private frame = 0;

  constructor(map: CityMap, colors: LineColors) {
    this.map = map;
    this.colors = toColors(colors);

    this.mesh = this.createLineMesh(map.lineCount);
    this.object.add(this.mesh);

    this.paintWholeMap();
  }

  // ── State ────────────────────────────────────────────────────────────────

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getState = (): VisualizerState => this.state;

  subscribeProgress = (listener: () => void): (() => void) => {
    this.progressListeners.add(listener);
    return () => this.progressListeners.delete(listener);
  };

  /** Where playback is, or null when no search is on screen. */
  getProgress = (): PlaybackProgress | null => this.progress;

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
   * Runs a search between the two points, then plays its trace back on the
   * map. No-op unless both points are placed and nothing is on screen. With
   * `compareWith`, runs both algorithms and plays their traces on one cursor,
   * layered on the same map in their own colours.
   */
  start(algorithm: AlgorithmId, compareWith: AlgorithmId | null = null): boolean {
    const { status, start, end } = this.state;
    if (status !== "idle" || !start || !end) return false;
    const algorithms =
      compareWith && compareWith !== algorithm ? [algorithm, compareWith] : [algorithm];
    this.play(algorithms.map((id) => runSearch(this.map, id, start.node, end.node)));
    return true;
  }

  /** Cancels any search and erases what it drew. The points stay. */
  stop(): void {
    this.halt();
    this.playback = null;
    if (this.explored) this.explored.count = 0;
    this.written = 0;
    this.uploadedTo = 0;
    this.recoloured = [];
    for (const ribbon of this.ribbons) ribbon.dispose();
    this.ribbons = [];
    this.onInvalidate?.();
    this.setProgress(null);
    const { status, paused, result, comparison } = this.state;
    if (status !== "idle" || paused || result || comparison) {
      this.setState({ status: "idle", paused: false, result: null, comparison: null });
    }
  }

  /** Holds playback where it is. Returns false when there is nothing playing to pause. */
  pause(): boolean {
    const p = this.playback;
    if (!p || this.state.paused || isFinished(p)) return false;
    this.halt();
    this.setState({ paused: true });
    return true;
  }

  /** Carries on from where playback was paused. Returns false when it wasn't paused. */
  resume(): boolean {
    const p = this.playback;
    if (!p || !this.state.paused) return false;
    this.setState({ paused: false });
    this.run(p);
    return true;
  }

  /**
   * Jumps to the end of the search. Routes still draw in over about a second;
   * skipping again while they draw finishes them too. Unpauses.
   */
  skipToEnd(): void {
    const p = this.playback;
    if (!p || isFinished(p)) return;
    if (p.drawn < p.length) {
      p.cursor = p.length;
      this.draw(p, p.length, false);
    } else {
      for (const run of p.runs) if (run.stats.phase === "tracing") this.finishRoute(p, run);
    }
    this.flush();
    this.publish(p, true);
    if (isFinished(p)) {
      this.halt();
      if (this.state.paused) this.setState({ paused: false });
    } else if (!this.playing) {
      this.setState({ paused: false });
      this.run(p);
    }
  }

  /**
   * Moves the cursor to `position` expansions, forwards or backwards, and
   * draws the search as it was there. Routes of searches that have finished
   * by then appear whole. Playing carries on from the new position; a search
   * that had finished and is moved back stays paused there.
   */
  seek(position: number): void {
    const p = this.playback;
    if (!p) return;
    const k = Math.min(p.length, Math.max(0, Math.round(position)));
    p.cursor = k;
    this.draw(p, k, true);
    this.flush();
    if (isFinished(p)) {
      this.halt();
      if (this.state.paused) this.setState({ paused: false });
    } else if (!this.playing && !this.state.paused) {
      this.setState({ paused: true });
    }
    this.publish(p, true);
  }

  /** Recolours the map. Search and path colours apply from the next search. */
  setColors(colors: LineColors): void {
    const next = toColors(colors);
    const mapChanged = !next.map.equals(this.colors.map);
    this.colors = next;
    if (mapChanged) this.paintWholeMap();
  }

  dispose(): void {
    this.halt();
    for (const ribbon of this.ribbons) ribbon.dispose();
    this.explored?.dispose();
    this.mesh.dispose();
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.ribbonMaterial.dispose();
  }

  // ── Playback ─────────────────────────────────────────────────────────────

  /**
   * Plays one or two traces back on a single cursor, counted in expansions and
   * advanced at `speed` per second, so in a comparison the search that needed
   * fewer expansions visibly finishes first. Each trace draws its route as
   * soon as the cursor reaches its end.
   */
  private play(traces: Trace[]): void {
    const comparing = traces.length === 2;
    const reveal = buildReveal(traces, this.map.lineCount);
    this.reserveExplored(reveal.lines.length);
    const goal = this.state.end!.node;
    const routePairs = comparing ? sharedRouteLines(traces[0].route, traces[1].route) : new Int32Array(0);
    const p: Playback = {
      id: ++this.runId,
      runs: traces.map((trace, side) => ({
        trace,
        routeShown: 0,
        routeMs: 0,
        ribbon: this.addRibbon(trace, goal, side, comparing),
        stats: {
          algorithm: trace.algorithm,
          phase: "searching",
          found: false,
          meters: 0,
          nodesExpanded: 0,
          linesExplored: 0,
          computeMs: trace.computeMs,
        },
      })),
      reveal,
      length: Math.max(...traces.map((trace) => trace.expanded)),
      cursor: 0,
      drawn: 0,
      colors: this.colors,
      comparing,
      routePairs,
      pairShown: new Uint8Array(routePairs.length / 2),
      sharedPathLines: 0,
      result: { found: traces[0].found, meters: traces[0].meters, computeMs: traces[0].computeMs },
      last: null,
      lastPublish: -Infinity,
    };
    this.playback = p;
    this.setState({ paused: false, result: null, comparison: null });
    this.setProgress({ cursor: 0, length: p.length });
    this.publish(p, true);
    this.run(p);
  }

  private run(p: Playback): void {
    p.last = null;
    this.playing = true;
    this.frame = requestAnimationFrame(this.tick);
  }

  private halt(): void {
    cancelAnimationFrame(this.frame);
    this.playing = false;
  }

  private tick = (now: number): void => {
    const p = this.playback;
    if (!p) return;
    // Cap the step so a stalled or backgrounded tab doesn't leap ahead.
    const elapsed = p.last === null ? FRAME_MS : Math.min(now - p.last, MAX_FRAME_MS);
    p.last = now;
    const instant = !Number.isFinite(this.speed);
    if (p.cursor < p.length) {
      p.cursor = instant ? p.length : Math.min(p.length, p.cursor + (this.speed * elapsed) / 1000);
    }
    let changed = this.draw(p, Math.floor(p.cursor), false);

    for (const run of p.runs) {
      if (run.stats.phase !== "tracing") continue;
      // Draw the route back from the goal, in about a second however long it is.
      const lines = run.trace.route.length;
      run.routeMs += elapsed;
      const until = instant ? lines : Math.min(lines, Math.ceil((lines * run.routeMs) / ROUTE_MS));
      if (until !== run.routeShown) this.showRoute(p, run, until);
      if (until === lines) {
        run.stats.phase = "done";
        changed = true;
      }
    }

    this.flush();
    this.publish(p, changed, now);
    if (isFinished(p)) this.playing = false;
    else this.frame = requestAnimationFrame(this.tick);
  };

  /**
   * Draws the traces as they were after `k` expansions and brings each run's
   * phase in line with it. A run moved back before its end loses its route;
   * with `settle`, a run at or past its end shows its whole route at once.
   * Returns whether any run changed phase.
   */
  private draw(p: Playback, k: number, settle: boolean): boolean {
    this.paintExplored(p, k);
    let changed = false;
    for (const run of p.runs) {
      const { trace, stats } = run;
      const reached = Math.min(k, trace.expanded);
      stats.nodesExpanded = reached;
      stats.linesExplored = trace.marks[reached];
      if (reached < trace.expanded) {
        if (stats.phase === "searching") continue;
        stats.phase = "searching";
        stats.found = false;
        stats.meters = 0;
        run.routeMs = 0;
        this.showRoute(p, run, 0);
        changed = true;
        continue;
      }
      if (stats.phase === "searching") {
        stats.found = trace.found;
        stats.meters = trace.meters;
        stats.phase = trace.route.length > 0 ? "tracing" : "done";
        run.routeMs = 0;
        changed = true;
      }
      if (settle && stats.phase === "tracing") {
        this.finishRoute(p, run);
        changed = true;
      }
    }
    if (this.progress?.cursor !== k) this.setProgress({ cursor: k, length: p.length });
    return changed;
  }

  /** Shows the explored overlay as it was after `k` expansions. */
  private paintExplored(p: Playback, k: number): void {
    const from = p.drawn;
    if (k === from) return;
    const { reveal } = p;
    const mesh = this.explored!;
    const count = reveal.slotsAt[k];
    const written = this.written;
    for (let slot = written; slot < count; slot++) {
      this.writeLine(mesh, slot, reveal.lines[slot], "search", slotColor(p, slot, k));
    }
    this.written = Math.max(written, count);

    // Lines the other compared run reached between the two cursors change colour.
    if (reveal.shared) {
      const lo = reveal.sharedAt![Math.min(from, k)];
      const hi = reveal.sharedAt![Math.max(from, k)];
      const colors = mesh.instanceColor!.array;
      for (let i = lo; i < hi; i++) {
        const slot = reveal.shared[i];
        if (slot >= written) continue; // just written in its current colour
        slotColor(p, slot, k).toArray(colors, slot * 3);
        if (slot < this.uploadedTo) this.recoloured.push(slot);
      }
    }

    mesh.count = count;
    p.drawn = k;
  }

  /** Shows a run's first `lines` route lines, marking those both compared routes show. */
  private showRoute(p: Playback, run: Run, lines: number): void {
    run.routeShown = lines;
    run.ribbon?.show(lines);
    if (!p.comparing) return;
    const [a, b] = p.runs;
    const { routePairs: pairs, pairShown, colors } = p;
    for (let j = 0; j < pairShown.length; j++) {
      const shown = pairs[j * 2] < a.routeShown && pairs[j * 2 + 1] < b.routeShown ? 1 : 0;
      if (shown === pairShown[j]) continue;
      pairShown[j] = shown;
      p.sharedPathLines += shown ? 1 : -1;
      a.ribbon!.colorLine(pairs[j * 2], shown ? colors.pathBoth : colors.pathA);
      b.ribbon!.colorLine(pairs[j * 2 + 1], shown ? colors.pathBoth : colors.pathB);
    }
  }

  private finishRoute(p: Playback, run: Run): void {
    this.showRoute(p, run, run.trace.route.length);
    run.stats.phase = "done";
  }

  /**
   * Sends the state to React when a phase changed (or `force`), and live
   * comparison stats at most every PUBLISH_INTERVAL_MS.
   */
  private publish(p: Playback, force: boolean, now = performance.now()): void {
    if (!force && !(p.comparing && now - p.lastPublish >= PUBLISH_INTERVAL_MS)) return;
    p.lastPublish = now;
    const phases = p.runs.map((run) => run.stats.phase);
    const status: VisualizerStatus = phases.includes("searching")
      ? "searching"
      : phases.includes("tracing")
        ? "tracing"
        : "done";
    if (!p.comparing) {
      this.setState({ status, result: status === "searching" ? null : p.result });
      return;
    }
    const [a, b] = p.runs;
    this.setState({
      status,
      comparison: {
        id: p.id,
        runs: [{ ...a.stats }, { ...b.stats }],
        sharedLines: p.reveal.sharedAt![p.drawn],
        sharedPathLines: p.sharedPathLines,
      },
    });
  }

  /** Makes sure the explored overlay can hold `lines` lines, emptying it. */
  private reserveExplored(lines: number): void {
    this.written = 0;
    this.uploadedTo = 0;
    this.recoloured = [];
    const current = this.explored;
    if (current && current.instanceMatrix.count >= lines) {
      current.count = 0;
      return;
    }
    if (current) {
      current.removeFromParent();
      current.dispose();
    }
    const mesh = this.createLineMesh(Math.max(lines, MIN_EXPLORED_CAPACITY));
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0;
    this.explored = mesh;
    this.object.add(mesh);
  }

  /** Builds a trace's route ribbon, hidden until playback reaches it. */
  private addRibbon(trace: Trace, goal: number, side: number, comparing: boolean): RouteRibbon | null {
    if (trace.route.length === 0) return null;
    const c = this.colors;
    const ribbon = new RouteRibbon(this.map, trace.route, goal, {
      width: ROUTE_WIDTH,
      z: ROUTE_Z[side],
      color: comparing ? (side === 0 ? c.pathA : c.pathB) : c.path,
      material: this.ribbonMaterial,
    });
    this.ribbons.push(ribbon);
    this.object.add(ribbon.mesh);
    return ribbon;
  }

  /** The explored-line overlay, for tests; null before the first search. */
  get exploredMesh(): THREE.InstancedMesh | null {
    return this.explored;
  }

  /** The line in each drawn overlay slot, for tests. */
  get exploredLines(): Int32Array {
    return this.playback?.reveal.lines.subarray(0, this.explored!.count) ?? new Int32Array(0);
  }

  /** The route ribbons on screen, for tests. */
  get routeRibbons(): readonly RouteRibbon[] {
    return this.ribbons;
  }

  // ── Painting ─────────────────────────────────────────────────────────────

  /** Paints every line of the road network in the map colour, as one upload. */
  private paintWholeMap(): void {
    const color = this.colors.map;
    for (let line = 0; line < this.map.lineCount; line++) {
      this.writeLine(this.mesh, line, line, "map", color);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor!.needsUpdate = true;
    this.onInvalidate?.();
  }

  /** An instanced mesh of `capacity` round-ended lines, sharing the road network's geometry and material. */
  private createLineMesh(capacity: number): THREE.InstancedMesh {
    const base = this.mesh as THREE.InstancedMesh | undefined;
    const geometry = base?.geometry ?? new THREE.PlaneGeometry(1, 1).translate(0.5, 0, 0);
    let material = base?.material as THREE.MeshBasicMaterial | undefined;
    if (!material) {
      material = new THREE.MeshBasicMaterial({
        side: THREE.DoubleSide,
        toneMapped: false,
        alphaToCoverage: true,
      });
      roundLineEnds(material);
    }
    const mesh = new THREE.InstancedMesh(geometry, material, capacity);
    mesh.frustumCulled = false;
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    return mesh;
  }

  /** Writes a line's transform and colour into instance `index` of `target`. */
  private writeLine(
    target: THREE.InstancedMesh,
    index: number,
    line: number,
    style: keyof typeof STYLE,
    color: THREE.Color
  ): void {
    const { nodeX, nodeY, lineFrom, lineTo } = this.map;
    const { width, z } = STYLE[style];
    const from = lineFrom[line];
    const to = lineTo[line];
    const dx = nodeX[to] - nodeX[from];
    const dy = nodeY[to] - nodeY[from];
    const length = Math.hypot(dx, dy);
    // Unit direction; a zero-length line still gets a (round) dot.
    const ux = length ? dx / length : 1;
    const uy = length ? dy / length : 0;
    // The quad runs half a width past each end, where the shader rounds it off.
    const half = width / 2;
    const span = length + width;

    // Column-major: X axis along the segment, Y axis across it, then position.
    const m = target.instanceMatrix.array;
    const o = index * 16;
    m[o] = ux * span;
    m[o + 1] = uy * span;
    m[o + 4] = -uy * width;
    m[o + 5] = ux * width;
    m[o + 10] = 1;
    m[o + 12] = nodeX[from] - ux * half;
    m[o + 13] = nodeY[from] - uy * half;
    m[o + 14] = z;
    m[o + 15] = 1;

    const c = target.instanceColor!.array;
    c[index * 3] = color.r;
    c[index * 3 + 1] = color.g;
    c[index * 3 + 2] = color.b;
  }

  /**
   * Sends the overlay's newly written lines to the GPU as one contiguous
   * range per buffer (plus any recoloured ones), and asks for a frame.
   */
  private flush(): void {
    const mesh = this.explored;
    if (mesh) {
      const matrices = mesh.instanceMatrix;
      const colors = mesh.instanceColor!;
      const from = this.uploadedTo;
      const to = this.written;
      if (to > from) {
        matrices.addUpdateRange(from * 16, (to - from) * 16);
        colors.addUpdateRange(from * 3, (to - from) * 3);
        matrices.needsUpdate = true;
        colors.needsUpdate = true;
      }
      const recoloured = this.recoloured;
      if (recoloured.length > MAX_RECOLOUR_RANGES) {
        let low = Infinity;
        let high = -Infinity;
        for (const slot of recoloured) {
          low = Math.min(low, slot);
          high = Math.max(high, slot);
        }
        colors.addUpdateRange(low * 3, (high - low + 1) * 3);
      } else {
        for (const slot of recoloured) colors.addUpdateRange(slot * 3, 3);
      }
      if (recoloured.length > 0) colors.needsUpdate = true;
      this.uploadedTo = to;
      this.recoloured = [];
    }
    this.onInvalidate?.();
  }

  private setState(patch: Partial<VisualizerState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }

  private setProgress(progress: PlaybackProgress | null): void {
    this.progress = progress;
    for (const listener of this.progressListeners) listener();
  }
}

const isFinished = (p: Playback) => p.runs.every((run) => run.stats.phase === "done");

/** An overlay slot's colour with the cursor at `k`: its run's, or the search colour once both runs explored it. */
function slotColor(p: Playback, slot: number, k: number): THREE.Color {
  const { side, bothAt } = p.reveal;
  const c = p.colors;
  if (!side || bothAt![slot] <= k) return c.search;
  return side[slot] === 0 ? c.compareA : c.compareB;
}

/**
 * Lays out the explored overlay for one trace, or for two compared traces on
 * one cursor. Two traces are interleaved one expansion at a time (first run,
 * then second), so every cursor maps to exactly one prefix of the overlay.
 */
function buildReveal(traces: Trace[], lineCount: number): Reveal {
  if (traces.length === 1) {
    const [trace] = traces;
    return {
      lines: trace.lines,
      slotsAt: trace.marks,
      side: null,
      bothAt: null,
      shared: null,
      sharedAt: null,
    };
  }

  const length = Math.max(...traces.map((trace) => trace.expanded));
  const total = traces[0].lines.length + traces[1].lines.length;
  const slotOf = new Int32Array(lineCount).fill(-1);
  const lines = new Int32Array(total);
  const side = new Uint8Array(total);
  const bothAt = new Int32Array(total).fill(NEVER);
  const shared = new Int32Array(Math.min(traces[0].lines.length, traces[1].lines.length));
  const slotsAt = new Int32Array(length + 1);
  const sharedAt = new Int32Array(length + 1);
  let slots = 0;
  let both = 0;

  for (let k = 1; k <= length; k++) {
    for (let s = 0; s < 2; s++) {
      const { expanded, marks, lines: explored } = traces[s];
      if (k > expanded) continue;
      for (let i = marks[k - 1]; i < marks[k]; i++) {
        const line = explored[i];
        const slot = slotOf[line];
        if (slot === -1) {
          slotOf[line] = slots;
          lines[slots] = line;
          side[slots] = s;
          slots++;
        } else if (side[slot] !== s && bothAt[slot] === NEVER) {
          bothAt[slot] = k;
          shared[both++] = slot;
        }
      }
    }
    slotsAt[k] = slots;
    sharedAt[k] = both;
  }

  return {
    lines: lines.subarray(0, slots),
    slotsAt,
    side,
    bothAt,
    shared: shared.subarray(0, both),
    sharedAt,
  };
}

/** Index pairs (in `a`, in `b`) of the lines two routes share. */
function sharedRouteLines(a: readonly number[], b: readonly number[]): Int32Array {
  const inB = new Map(b.map((line, i) => [line, i]));
  const pairs: number[] = [];
  a.forEach((line, i) => {
    const j = inB.get(line);
    if (j !== undefined) pairs.push(i, j);
  });
  return Int32Array.from(pairs);
}

/**
 * Rounds both ends of every instanced line, so lines meeting at an angle join
 * in a smooth round corner instead of overlapping square ends. Each instance's
 * quad must already reach half its width past each end (see `writeLine`); the
 * fragment shader trims those overhangs to semicircles. Only the ends are
 * trimmed, so a line thinner than a pixel never loses its body.
 */
function roundLineEnds(material: THREE.MeshBasicMaterial): void {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec2 vLinePos;
varying float vLineSpan;
varying float vLineRadius;`
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
#ifdef USE_INSTANCING
  float lineSpan = length(instanceMatrix[0].xy);
  float lineWidth = length(instanceMatrix[1].xy);
  vLinePos = vec2(position.x * lineSpan, position.y * lineWidth);
  vLineSpan = lineSpan;
  vLineRadius = lineWidth * 0.5;
#endif`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec2 vLinePos;
varying float vLineSpan;
varying float vLineRadius;`
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
{
  // How far past the line's end this pixel is, along the line; 0 along its body.
  float along = vLinePos.x - clamp(vLinePos.x, vLineRadius, vLineSpan - vLineRadius);
  float edge = length(vec2(along, vLinePos.y)) - vLineRadius;
  float aa = fwidth(edge);
  float coverage = along == 0.0 ? 1.0 : 1.0 - smoothstep(-aa, aa, edge);
  #ifdef ALPHA_TO_COVERAGE
    diffuseColor.a *= coverage;
    if (diffuseColor.a <= 0.0) discard;
  #else
    if (coverage < 0.5) discard;
  #endif
}`
      );
  };
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
