import * as THREE from "three";
import { nearestNode, type CityMap } from "../city/city-map";
import { Lightning } from "./lightning";
import { RouteRibbon } from "./route-ribbon";
import { runSearch, type AlgorithmId, type Trace } from "./search";

export type VisualizerStatus = "idle" | "searching" | "tracing" | "done";

/**
 * Moments in a strike worth reacting to, e.g. with sound: a found route's
 * leader setting off ("strike") and its flash ("thunder"). Never sent for
 * routes that only appear because the timeline was scrubbed.
 */
export type StrikeCue = "strike" | "thunder";

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
  /** Route lines drawn so far. */
  routeShown: number;
  /**
   * Time since the search reached its end and its route began to strike in;
   * STRIKE_MS or more once the strike has played out (or there is none).
   */
  strikeMs: number;
  /** The route, drawn as one smooth ribbon, and the bolt that strikes along it; null when there is none. */
  ribbon: RouteRibbon | null;
  bolt: Lightning | null;
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
  /** The expansion that revealed each slot's line, which sets how hot it still glows. */
  birth: Float32Array;
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
  /** Expansions it takes an explored line to cool from white-hot to its search colour. */
  heatSpan: number;
  /** Time since the cursor reached the end, over which every explored line cools down. */
  coolMs: number;
  /** Whether the viewer asked for reduced motion: strikes flash once instead of flickering. */
  calm: boolean;
  /** Time of the last frame, or null when the next frame is the first since (re)starting. */
  last: number | null;
  lastPublish: number;
}

const NEVER = 0x7fffffff;

/** How often live comparison stats reach React while searches run. */
const PUBLISH_INTERVAL_MS = 100;

/** Playback speed in expansions per second; Infinity draws a whole trace at once. */
export const DEFAULT_SPEED = 1800;

/**
 * A found route strikes in like lightning: a leader races from the goal back
 * to the start, however long the route, then the whole route flashes and
 * flickers before settling to its colour.
 */
const LEADER_MS = 450;
const FLASH_MS = 1100;
const STRIKE_MS = LEADER_MS + FLASH_MS;
/** Return strokes in a flash, as [ms after it starts, brightness], and how fast each dies. */
const FLASH_PULSES = [
  [0, 2.6],
  [110, 1.7],
  [240, 1.1],
] as const;
const PULSE_DECAY_MS = 80;
/** The glow left after the return strokes, and how fast it dies. */
const AFTERGLOW = 0.5;
const AFTERGLOW_MS = 450;
/** How much a flash lights up the explored lines and the rest of the map. */
const FLASH_EXPLORED = 0.25;
const FLASH_MAP = 0.22;

/**
 * Explored lines are white-hot when revealed, settle to their search colour
 * after `heatSpan` expansions, and cool to a dim ember by COOL_AGE spans.
 * The span grows with the square root of a search's size, so the hot band
 * keeps about the same share of the frontier for small and large searches.
 */
const HEAT_PER_ROOT_EXPANSION = 2.5;
const MIN_HEAT_SPAN = 40;
const COOL_AGE = 10;
/** How dim a fully cooled line is, and how bright a white-hot one, relative to its search colour. */
const COOL_LEVEL = 0.45;
/** How much more saturated a cooled line is than its search colour. */
const COOL_SATURATION = 2.2;
const HOT_GAIN = 1.8;
/** Once the search ends, the lines still glowing cool down over this, starting after a beat. */
const COOL_DELAY_MS = 200;
const COOL_MS = 1200;
const COOLED_MS = COOL_DELAY_MS + COOL_MS;
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
/** Lightning crackles over both routes. */
const BOLT_Z = 0.012;

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

  /** Shader inputs shared by the road network and explored overlay materials. */
  private readonly lineFx = {
    uHeatCursor: { value: 0 },
    uHeatSpan: { value: MIN_HEAT_SPAN },
    uFlash: { value: 0 },
  };
  private readonly roadMaterial = createLineMaterial(this.lineFx, false);
  private readonly exploredMaterial = createLineMaterial(this.lineFx, true);

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
  private readonly cueListeners = new Set<(cue: StrikeCue) => void>();

  private ribbons: RouteRibbon[] = [];
  private bolts: Lightning[] = [];
  private frame = 0;

  constructor(map: CityMap, colors: LineColors) {
    this.map = map;
    this.colors = toColors(colors);

    this.mesh = createLineMesh(map.lineCount, this.roadMaterial);
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

  /** Hears each found route strike in (see `StrikeCue`). */
  subscribeCue = (listener: (cue: StrikeCue) => void): (() => void) => {
    this.cueListeners.add(listener);
    return () => this.cueListeners.delete(listener);
  };

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
    this.disposeRoutes();
    this.lineFx.uFlash.value = 0;
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
    if (!p || this.state.paused || searchDone(p)) return false;
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
   * Jumps to the end of the search. Routes still strike in over about a
   * second; skipping again finishes them (and the cool-down) too. Unpauses.
   */
  skipToEnd(): void {
    const p = this.playback;
    if (!p || isFinished(p)) return;
    if (p.drawn < p.length) {
      p.cursor = p.length;
      this.draw(p, p.length, false);
    } else {
      for (const run of p.runs) {
        // Skipping the strike still lands it.
        if (run.stats.phase === "tracing") this.cue("thunder");
        this.settleStrike(p, run);
      }
      p.coolMs = COOLED_MS;
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
    this.disposeRoutes();
    this.explored?.dispose();
    this.explored?.geometry.dispose();
    this.mesh.dispose();
    this.mesh.geometry.dispose();
    this.roadMaterial.dispose();
    this.exploredMaterial.dispose();
  }

  private disposeRoutes(): void {
    for (const ribbon of this.ribbons) ribbon.dispose();
    for (const bolt of this.bolts) bolt.dispose();
    this.ribbons = [];
    this.bolts = [];
  }

  // ── Playback ─────────────────────────────────────────────────────────────

  /**
   * Plays one or two traces back on a single cursor, counted in expansions and
   * advanced at `speed` per second, so in a comparison the search that needed
   * fewer expansions visibly finishes first. Each trace strikes its route in
   * as soon as the cursor reaches its end.
   */
  private play(traces: Trace[]): void {
    const comparing = traces.length === 2;
    const reveal = buildReveal(traces, this.map.lineCount);
    this.reserveExplored(reveal.lines.length);
    const goal = this.state.end!.node;
    const routePairs = comparing ? sharedRouteLines(traces[0].route, traces[1].route) : new Int32Array(0);
    const length = Math.max(...traces.map((trace) => trace.expanded));
    const p: Playback = {
      id: ++this.runId,
      runs: traces.map((trace, side) => ({
        trace,
        routeShown: 0,
        strikeMs: 0,
        ...this.addRoute(trace, goal, side, comparing),
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
      length,
      cursor: 0,
      drawn: 0,
      colors: this.colors,
      comparing,
      routePairs,
      pairShown: new Uint8Array(routePairs.length / 2),
      sharedPathLines: 0,
      result: { found: traces[0].found, meters: traces[0].meters, computeMs: traces[0].computeMs },
      heatSpan: Math.max(MIN_HEAT_SPAN, HEAT_PER_ROOT_EXPANSION * Math.sqrt(length)),
      coolMs: 0,
      calm: prefersReducedMotion(),
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
      if (run.stats.phase === "searching" || run.strikeMs >= STRIKE_MS) continue;
      run.strikeMs = instant ? STRIKE_MS : run.strikeMs + elapsed;
      if (run.stats.phase !== "tracing") continue;
      // The leader races back from the goal; the route is drawn as far as it has reached.
      if (run.strikeMs >= LEADER_MS) {
        this.finishRoute(p, run);
        this.cue("thunder");
        changed = true;
      } else {
        const until = run.ribbon!.linesReaching(leaderHead(run));
        if (until !== run.routeShown) this.showRoute(p, run, until);
      }
    }
    if (p.drawn >= p.length && p.coolMs < COOLED_MS) {
      p.coolMs = instant ? COOLED_MS : p.coolMs + elapsed;
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
    if (k < p.length) p.coolMs = 0;
    else if (settle) p.coolMs = COOLED_MS;
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
        run.strikeMs = 0;
        this.showRoute(p, run, 0);
        changed = true;
        continue;
      }
      if (stats.phase === "searching") {
        stats.found = trace.found;
        stats.meters = trace.meters;
        stats.phase = trace.route.length > 0 ? "tracing" : "done";
        run.strikeMs = stats.phase === "tracing" ? 0 : STRIKE_MS;
        // At Instant speed the strike lands this same frame, so only its thunder is heard.
        if (!settle && stats.phase === "tracing" && Number.isFinite(this.speed)) this.cue("strike");
        changed = true;
      }
      if (settle) {
        // Scrubbing shows routes as they end up, without striking them again.
        if (stats.phase === "tracing") changed = true;
        this.settleStrike(p, run);
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
    if (count > written) {
      (mesh.geometry.getAttribute("instanceBirth").array as Float32Array).set(
        reveal.birth.subarray(written, count),
        written
      );
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

  /** Skips a run's strike to its end: the route whole, nothing flashing. */
  private settleStrike(p: Playback, run: Run): void {
    if (run.stats.phase === "searching") return;
    if (run.stats.phase === "tracing") this.finishRoute(p, run);
    run.strikeMs = STRIKE_MS;
  }

  /** Sets the heat, strike and flash shader inputs from where playback is. */
  private paintEffects(p: Playback): void {
    let flash = 0;
    for (const run of p.runs) {
      if (!run.ribbon) continue;
      const { phase } = run.stats;
      const leading = phase === "tracing";
      const runFlash = phase === "done" ? flashAt(run.strikeMs - LEADER_MS, p.calm) : 0;
      const head = leading ? leaderHead(run) : null;
      run.ribbon.setStrike(head, leading, runFlash);
      run.bolt?.setStrike(head, leading, runFlash);
      flash = Math.max(flash, runFlash);
    }
    const cool = smoothstep(Math.min(1, Math.max(0, (p.coolMs - COOL_DELAY_MS) / COOL_MS)));
    this.lineFx.uHeatSpan.value = p.heatSpan;
    this.lineFx.uHeatCursor.value = p.cursor + cool * COOL_AGE * p.heatSpan;
    this.lineFx.uFlash.value = flash;
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
      current.geometry.dispose();
    }
    const capacity = Math.max(lines, MIN_EXPLORED_CAPACITY);
    const mesh = createLineMesh(capacity, this.exploredMaterial);
    const birth = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
    mesh.geometry.setAttribute("instanceBirth", birth);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
    birth.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0;
    this.explored = mesh;
    this.object.add(mesh);
  }

  /** Builds a trace's route ribbon and lightning bolt, hidden until playback reaches them. */
  private addRoute(
    trace: Trace,
    goal: number,
    side: number,
    comparing: boolean
  ): { ribbon: RouteRibbon | null; bolt: Lightning | null } {
    if (trace.route.length === 0) return { ribbon: null, bolt: null };
    const c = this.colors;
    const color = comparing ? (side === 0 ? c.pathA : c.pathB) : c.path;
    const ribbon = new RouteRibbon(this.map, trace.route, goal, {
      width: ROUTE_WIDTH,
      z: ROUTE_Z[side],
      color,
    });
    const bolt = new Lightning(ribbon.centreline, {
      z: BOLT_Z,
      color: color.clone().lerp(WHITE, 0.55),
      seed: trace.route[0] * 31 + trace.route.length * 7 + side,
    });
    this.ribbons.push(ribbon);
    this.bolts.push(bolt);
    this.object.add(ribbon.mesh, bolt.mesh);
    return { ribbon, bolt };
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

  /** The lightning bolts on screen, for tests. */
  get routeBolts(): readonly Lightning[] {
    return this.bolts;
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
      const births = mesh.geometry.getAttribute("instanceBirth") as THREE.InstancedBufferAttribute;
      const from = this.uploadedTo;
      const to = this.written;
      if (to > from) {
        matrices.addUpdateRange(from * 16, (to - from) * 16);
        colors.addUpdateRange(from * 3, (to - from) * 3);
        births.addUpdateRange(from, to - from);
        matrices.needsUpdate = true;
        colors.needsUpdate = true;
        births.needsUpdate = true;
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
    if (this.playback) this.paintEffects(this.playback);
    this.onInvalidate?.();
  }

  private setState(patch: Partial<VisualizerState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }

  private cue(cue: StrikeCue): void {
    for (const listener of this.cueListeners) listener(cue);
  }

  private setProgress(progress: PlaybackProgress | null): void {
    this.progress = progress;
    for (const listener of this.progressListeners) listener();
  }
}

/** Every run's search has played out and its route is whole. */
const searchDone = (p: Playback) => p.runs.every((run) => run.stats.phase === "done");

/** …and every strike and the cool-down have played out too: nothing left to animate. */
const isFinished = (p: Playback) =>
  searchDone(p) && p.coolMs >= COOLED_MS && p.runs.every((run) => run.strikeMs >= STRIKE_MS);

/** How far from the goal a run's strike leader has reached. */
function leaderHead(run: Run): number {
  return run.ribbon!.centreline.length * Math.min(1, run.strikeMs / LEADER_MS);
}

/** A strike's flash brightness `t` ms after its leader lands: a few flickering return strokes, then a tail. */
function flashAt(t: number, calm: boolean): number {
  if (t < 0 || t >= FLASH_MS) return 0;
  const fade = 1 - t / FLASH_MS;
  if (calm) return 1.2 * Math.exp(-t / 300) * fade;
  let flash = AFTERGLOW * Math.exp(-t / AFTERGLOW_MS);
  for (const [at, peak] of FLASH_PULSES) if (t >= at) flash += peak * Math.exp(-(t - at) / PULSE_DECAY_MS);
  return flash * fade;
}

const smoothstep = (t: number) => t * t * (3 - 2 * t);

function prefersReducedMotion(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

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
      birth: birthsOf(trace.marks, trace.lines.length),
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
    birth: birthsOf(slotsAt, slots),
    side,
    bothAt,
    shared: shared.subarray(0, both),
    sharedAt,
  };
}

/** The expansion at which each of `slots` overlay slots appears, given the slots in use after each expansion. */
function birthsOf(slotsAt: Int32Array, slots: number): Float32Array {
  const birth = new Float32Array(slots);
  for (let k = 1; k < slotsAt.length; k++) birth.fill(k, slotsAt[k - 1], slotsAt[k]);
  return birth;
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

/** An instanced mesh of `capacity` lines drawn with `material`, each line's quad its own instance. */
function createLineMesh(capacity: number, material: THREE.Material): THREE.InstancedMesh {
  const geometry = new THREE.PlaneGeometry(1, 1).translate(0.5, 0, 0);
  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.frustumCulled = false;
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
  return mesh;
}

interface LineFx {
  uHeatCursor: { value: number };
  uHeatSpan: { value: number };
  uFlash: { value: number };
}

/**
 * The material for instanced lines, with both ends of every line rounded, so
 * lines meeting at an angle join in a smooth round corner instead of
 * overlapping square ends. Each instance's quad must already reach half its
 * width past each end (see `writeLine`); the fragment shader trims those
 * overhangs to semicircles. Only the ends are trimmed, so a line thinner than
 * a pixel never loses its body.
 *
 * With `heat`, each instance also needs an `instanceBirth` (the expansion
 * that revealed it), and glows by how long ago that was against the cursor:
 * white-hot when new, its own colour after a span, a dim ember after
 * COOL_AGE spans. Every line brightens with a strike's flash.
 */
function createLineMaterial(fx: LineFx, heat: boolean): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial({
    side: THREE.DoubleSide,
    toneMapped: false,
    alphaToCoverage: true,
  });
  const f = (n: number) => n.toFixed(4);
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uFlash = fx.uFlash;
    if (heat) {
      shader.uniforms.uHeatCursor = fx.uHeatCursor;
      shader.uniforms.uHeatSpan = fx.uHeatSpan;
    }
    const heatVertex = heat
      ? `uniform float uHeatCursor;
uniform float uHeatSpan;
attribute float instanceBirth;
varying float vHeatAge;`
      : "";
    const heatFragment = heat ? "varying float vHeatAge;" : "";
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec2 vLinePos;
varying float vLineSpan;
varying float vLineRadius;
${heatVertex}`
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
#endif
${heat ? "vHeatAge = max(uHeatCursor - instanceBirth, 0.0) / uHeatSpan;" : ""}`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
uniform float uFlash;
varying vec2 vLinePos;
varying float vLineSpan;
varying float vLineRadius;
${heatFragment}`
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
}
${
  heat
    ? `{
  vec3 base = diffuseColor.rgb;
  // Every stop is the search colour itself: lightened when hot, deepened and dimmed as it cools.
  vec3 hot = mix(base, vec3(1.0), 0.6) * ${f(HOT_GAIN)};
  // Embers deepen as well as dim, so even a pale search colour stays apart from the grey map.
  float grey = dot(base, vec3(0.2126, 0.7152, 0.0722));
  vec3 ember = clamp(mix(vec3(grey), base, ${f(COOL_SATURATION)}), 0.0, 1.0) * ${f(COOL_LEVEL)};
  vec3 color = mix(base, ember, smoothstep(1.0, ${f(COOL_AGE)}, vHeatAge));
  diffuseColor.rgb = mix(color, hot, exp(-1.8 * vHeatAge)) * (1.0 + uFlash * ${f(FLASH_EXPLORED)});
}`
    : `diffuseColor.rgb *= 1.0 + uFlash * ${f(FLASH_MAP)};`
}`
      );
  };
  // Both variants share one onBeforeCompile, so tell three's program cache apart.
  material.customProgramCacheKey = () => (heat ? "routify-line-heat" : "routify-line");
  return material;
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
