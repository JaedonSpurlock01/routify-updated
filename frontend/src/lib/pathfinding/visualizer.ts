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

/** One trace being played back, and how much of it is on screen. */
interface Run {
  trace: Trace;
  /** Explored lines painted so far. */
  shown: number;
  /** Route lines painted so far, and how long the route has been drawing. */
  routeShown: number;
  routeMs: number;
  /** The route, drawn as one smooth ribbon; null when there is none. */
  ribbon: RouteRibbon | null;
  /** Where each route line sits in `trace.route`. */
  routeIndex: Map<number, number>;
  stats: RunStats;
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
 * starts; what animates is its trace. React only needs to forward input
 * (`placePoint`, `start`, `stop`, …) and render `getState()`, via `subscribe`.
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
  /** Which comparison run explored or routed through each line; null outside comparisons. */
  private owner: Uint8Array | null = null;
  /** Each line's slot in the explored overlay during a comparison, or -1; null otherwise. */
  private slotOf: Int32Array | null = null;
  private runId = 0;

  /**
   * Explored lines, drawn over the road network. Lines are appended in the
   * order they are explored, so each frame uploads one contiguous run of new
   * instances instead of scattered writes into the (much larger) road
   * network buffers. Allocated by the first search that needs it, and only
   * reallocated when a search explores more lines than it holds.
   */
  private explored: THREE.InstancedMesh | null = null;
  /** First overlay slot not yet sent to the GPU. */
  private uploadedTo = 0;
  /** Already-uploaded overlay slots recoloured since the last upload. */
  private recoloured: number[] = [];

  private state: VisualizerState = {
    status: "idle",
    start: null,
    end: null,
    result: null,
    comparison: null,
  };
  private readonly listeners = new Set<() => void>();

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
    cancelAnimationFrame(this.frame);
    if (this.explored) this.explored.count = 0;
    this.uploadedTo = 0;
    this.recoloured = [];
    for (const ribbon of this.ribbons) ribbon.dispose();
    this.ribbons = [];
    this.owner = null;
    this.slotOf = null;
    this.onInvalidate?.();
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
    const owner = comparing ? (this.owner = new Uint8Array(this.map.lineCount)) : null;
    if (comparing) this.slotOf = new Int32Array(this.map.lineCount).fill(-1);
    // Each trace explores a line at most once and compared runs share a line's slot.
    const explored = traces.reduce((sum, trace) => sum + trace.lines.length, 0);
    this.reserveExplored(Math.min(explored, this.map.lineCount));
    const goal = this.state.end!.node;
    const runs: Run[] = traces.map((trace, side) => ({
      trace,
      shown: 0,
      routeShown: 0,
      routeMs: 0,
      ribbon: this.addRibbon(trace, goal, side, comparing),
      routeIndex: new Map(trace.route.map((line, i) => [line, i])),
      stats: {
        algorithm: trace.algorithm,
        phase: "searching",
        found: false,
        meters: 0,
        nodesExpanded: 0,
        linesExplored: 0,
        computeMs: trace.computeMs,
      },
    }));
    // A single run's result, revealed once its search has played out.
    const result: SearchResult = {
      found: traces[0].found,
      meters: traces[0].meters,
      computeMs: traces[0].computeMs,
    };
    const id = ++this.runId;
    let sharedLines = 0;
    let sharedPathLines = 0;
    let cursor = 0;
    let last: number | null = null;
    let lastPublish = -Infinity;

    const publish = () => {
      const phases = runs.map((run) => run.stats.phase);
      const status: VisualizerStatus = phases.includes("searching")
        ? "searching"
        : phases.includes("tracing")
          ? "tracing"
          : "done";
      if (!comparing) {
        this.setState({ status, result: status === "searching" ? null : result });
        return;
      }
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

    const explore = (line: number, side: number, stats: RunStats) => {
      if (!owner) {
        this.appendExplored(line, this.colors.search);
        stats.linesExplored++;
        return;
      }
      const bits = owner[line];
      if (bits & EXPLORED[side]) return;
      owner[line] = bits | EXPLORED[side];
      stats.linesExplored++;
      if (bits & EXPLORED[1 - side]) sharedLines++;
      this.paintOwned(line);
    };

    /** Counts a route line drawn; where both compared routes use it, paints it in both. */
    const route = (line: number, side: number) => {
      if (!owner) return;
      const bits = owner[line];
      owner[line] = bits | ROUTE[side];
      if (!(bits & ROUTE[1 - side])) return;
      sharedPathLines++;
      for (const run of runs) run.ribbon?.colorLine(run.routeIndex.get(line)!, this.colors.pathBoth);
    };

    const frame = (now: number) => {
      // Cap the step so a stalled or backgrounded tab doesn't leap ahead.
      const elapsed = last === null ? FRAME_MS : Math.min(now - last, MAX_FRAME_MS);
      last = now;
      const instant = !Number.isFinite(this.speed);
      cursor = instant ? Infinity : cursor + (this.speed * elapsed) / 1000;
      let drew = false;
      let phaseChanged = false;

      runs.forEach((run, side) => {
        const { trace, stats } = run;

        if (stats.phase === "searching") {
          const reached = Math.min(Math.floor(cursor), trace.expanded);
          const until = trace.marks[reached];
          for (let i = run.shown; i < until; i++) explore(trace.lines[i], side, stats);
          drew ||= until > run.shown;
          run.shown = until;
          stats.nodesExpanded = reached;
          if (reached < trace.expanded) return;

          stats.found = trace.found;
          stats.meters = trace.meters;
          stats.phase = trace.route.length > 0 ? "tracing" : "done";
          phaseChanged = true;
          if (!instant) return; // the route starts drawing next frame
        }

        if (stats.phase === "tracing") {
          // Draw the route back from the goal, in about a second however long it is.
          const lines = trace.route;
          run.routeMs += elapsed;
          const until = instant
            ? lines.length
            : Math.min(lines.length, Math.ceil((lines.length * run.routeMs) / ROUTE_MS));
          for (let i = run.routeShown; i < until; i++) route(lines[i], side);
          run.ribbon?.show(until);
          drew ||= until > run.routeShown;
          run.routeShown = until;
          if (until === lines.length) {
            stats.phase = "done";
            phaseChanged = true;
          }
        }
      });

      if (drew) this.flush();
      const finished = runs.every((run) => run.stats.phase === "done");
      if (phaseChanged || (comparing && now - lastPublish >= PUBLISH_INTERVAL_MS)) {
        lastPublish = now;
        publish();
      }
      if (!finished) this.frame = requestAnimationFrame(frame);
    };

    this.setState({ result: null, comparison: null });
    publish();
    this.frame = requestAnimationFrame(frame);
  }

  /** Paints a line by which comparison runs explored it, recolouring it if already drawn. */
  private paintOwned(line: number): void {
    const bits = this.owner![line];
    const c = this.colors;
    const color =
      (bits & EXPLORED_BOTH) === EXPLORED_BOTH ? c.search : bits & EXPLORED[0] ? c.compareA : c.compareB;
    const slot = this.slotOf![line];
    if (slot === -1) {
      this.slotOf![line] = this.appendExplored(line, color);
      return;
    }
    color.toArray(this.explored!.instanceColor!.array, slot * 3);
    if (slot < this.uploadedTo) this.recoloured.push(slot);
  }

  /** Makes sure the explored overlay can hold `lines` lines, emptying it. */
  private reserveExplored(lines: number): void {
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

  /** Draws a line in the explored overlay and returns its slot. */
  private appendExplored(line: number, color: THREE.Color): number {
    const mesh = this.explored!;
    const slot = mesh.count++;
    this.writeLine(mesh, slot, line, "search", color);
    return slot;
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
   * Sends the overlay's new lines to the GPU as one contiguous range per
   * buffer (plus any recoloured ones), and asks for a frame.
   */
  private flush(): void {
    const mesh = this.explored;
    if (mesh) {
      const matrices = mesh.instanceMatrix;
      const colors = mesh.instanceColor!;
      const from = this.uploadedTo;
      const to = mesh.count;
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
