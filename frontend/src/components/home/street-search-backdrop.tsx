import { useEffect, useRef } from "react";
import { DEFAULT_COLORS } from "@/lib/state";

/** Pixels between cross streets; blocks are taller than they are wide. */
const SPACING = 24;
const BLOCK_ASPECT = 1.45;
/** Opacity of streets the search hasn't reached. */
const STREET_ALPHA = 0.07;
/** Below 1 the search spreads wider than plain A* before committing, which reads better. */
const HEURISTIC_WEIGHT = 0.6;
/** Nodes expanded per second, as a share of all nodes, so screen size doesn't change the pace. */
const EXPANSION_RATE = 1 / 9;
const ROUTE_MS = 700;
const HOLD_MS = 2600;
const FADE_MS = 900;

const SEARCH_RGB = hexToRgb(DEFAULT_COLORS.search);

/** Explored roads by age in seconds: white-hot, then cooling into the search colour. */
const HEAT = [
  { maxAge: 0.12, style: "rgba(255,255,255,0.95)", width: 1.6 },
  { maxAge: 0.6, style: `rgba(${SEARCH_RGB},0.85)`, width: 1.4 },
  { maxAge: 2.5, style: `rgba(${SEARCH_RGB},0.55)`, width: 1.2 },
  { maxAge: Infinity, style: `rgba(${SEARCH_RGB},0.32)`, width: 1.1 },
];

function hexToRgb(hex: string): string {
  const value = parseInt(hex.slice(1), 16);
  return `${value >> 16},${(value >> 8) & 255},${value & 255}`;
}

/** Small seeded PRNG, so the street layout is the same on every visit. */
function seededRandom(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Streets {
  xs: Float32Array;
  ys: Float32Array;
  neighbours: number[][];
  /** Flat [a, b, a, b, …] node pairs. */
  minor: number[];
  /** Avenues every few blocks, drawn brighter. */
  avenues: number[];
}

/**
 * A grid of long blocks bent by slow waves, with avenues every few streets and
 * gaps for parks, so it reads as a city rather than graph paper. Overshoots
 * the screen so no edge shows.
 */
function buildStreets(width: number, height: number): Streets {
  const random = seededRandom(1);
  const sx = SPACING;
  const sy = SPACING * BLOCK_ASPECT;
  const cols = Math.ceil(width / sx) + 6;
  const rows = Math.ceil(height / sy) + 6;
  const xs = new Float32Array(cols * rows);
  const ys = new Float32Array(cols * rows);
  const phase = random() * 10;

  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const k = j * cols + i;
      const x = (i - 3) * sx + (random() - 0.5) * sx * 0.12;
      const y = (j - 3) * sy + (random() - 0.5) * sy * 0.12;
      xs[k] = x + Math.sin(y * 0.0022 + phase) * SPACING * 2.6;
      ys[k] = y + Math.sin(x * 0.0018 + phase * 1.3) * SPACING * 1.8;
    }
  }

  const inPark = (k: number) =>
    Math.sin(xs[k] * 0.011 + phase) * Math.sin(ys[k] * 0.013 + phase * 2) > 0.8;
  const neighbours: number[][] = Array.from({ length: xs.length }, () => []);
  const minor: number[] = [];
  const avenues: number[] = [];
  const link = (a: number, b: number, avenue: boolean) => {
    if (!avenue && inPark(a) && inPark(b)) return;
    neighbours[a].push(b);
    neighbours[b].push(a);
    (avenue ? avenues : minor).push(a, b);
  };

  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const k = j * cols + i;
      const avenueRow = j % 4 === 0;
      const avenueCol = i % 6 === 0;
      if (i + 1 < cols && (avenueRow || random() > 0.16)) link(k, k + 1, avenueRow);
      if (j + 1 < rows && (avenueCol || random() > 0.16)) link(k, k + cols, avenueCol);
      if (i + 1 < cols && j + 1 < rows && random() < 0.025) link(k, k + cols + 1, false);
    }
  }
  return { xs, ys, neighbours, minor, avenues };
}

/** A* that runs a few nodes at a time, recording when each road was first explored. */
class SteppedSearch {
  readonly start: number;
  readonly goal: number;
  /** Explored roads as parallel arrays: from, to, and when (ms). */
  readonly exploredFrom: number[] = [];
  readonly exploredTo: number[] = [];
  readonly exploredAt: number[] = [];
  path: number[] | null = null;
  exhausted = false;

  private streets: Streets;
  private cost: Float64Array;
  private parent: Int32Array;
  private closed: Uint8Array;
  private queueKey: number[] = [];
  private queueNode: number[] = [];

  constructor(streets: Streets, start: number, goal: number) {
    this.streets = streets;
    this.start = start;
    this.goal = goal;
    const n = streets.xs.length;
    this.cost = new Float64Array(n).fill(Infinity);
    this.parent = new Int32Array(n).fill(-1);
    this.closed = new Uint8Array(n);
    this.cost[start] = 0;
    this.push(start, this.estimate(start));
  }

  private distance(a: number, b: number) {
    const { xs, ys } = this.streets;
    return Math.hypot(xs[a] - xs[b], ys[a] - ys[b]);
  }

  private estimate(node: number) {
    return HEURISTIC_WEIGHT * this.distance(node, this.goal);
  }

  private push(node: number, key: number) {
    const keys = this.queueKey;
    const nodes = this.queueNode;
    let i = keys.length;
    keys.push(key);
    nodes.push(node);
    while (i > 0) {
      const up = (i - 1) >> 1;
      if (keys[up] <= keys[i]) break;
      [keys[up], keys[i]] = [keys[i], keys[up]];
      [nodes[up], nodes[i]] = [nodes[i], nodes[up]];
      i = up;
    }
  }

  private pop(): number {
    const keys = this.queueKey;
    const nodes = this.queueNode;
    const top = nodes[0];
    const lastKey = keys.pop()!;
    const lastNode = nodes.pop()!;
    if (keys.length === 0) return top;
    keys[0] = lastKey;
    nodes[0] = lastNode;
    for (let i = 0; ; ) {
      const left = 2 * i + 1;
      let min = i;
      if (left < keys.length && keys[left] < keys[min]) min = left;
      if (left + 1 < keys.length && keys[left + 1] < keys[min]) min = left + 1;
      if (min === i) break;
      [keys[min], keys[i]] = [keys[i], keys[min]];
      [nodes[min], nodes[i]] = [nodes[i], nodes[min]];
      i = min;
    }
    return top;
  }

  /** Expands up to `count` nodes; sets `path` on reaching the goal. */
  step(count: number, now: number) {
    for (let done = 0; done < count && !this.path; done++) {
      if (this.queueKey.length === 0) {
        this.exhausted = true;
        return;
      }
      const u = this.pop();
      if (this.closed[u]) continue;
      this.closed[u] = 1;
      if (u === this.goal) {
        const path = [];
        for (let v = u; v !== -1; v = this.parent[v]) path.push(v);
        this.path = path.reverse();
        return;
      }
      for (const v of this.streets.neighbours[u]) {
        if (this.closed[v]) continue;
        this.exploredFrom.push(u);
        this.exploredTo.push(v);
        this.exploredAt.push(now);
        const cost = this.cost[u] + this.distance(u, v);
        if (cost < this.cost[v]) {
          this.cost[v] = cost;
          this.parent[v] = u;
          this.push(v, cost + this.estimate(v));
        }
      }
    }
  }
}

/**
 * Home page backdrop: a made-up street grid with an A* search playing across
 * it on loop, drawn like the map page (white-hot frontier cooling to the search
 * colour, then the route struck in red). Reduced motion gets one finished
 * search, still.
 */
export function StreetSearchBackdrop({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const pickPoints = seededRandom(7);

    let width = 0;
    let height = 0;
    let streets: Streets;
    let streetLayer: HTMLCanvasElement;
    let search: SteppedSearch;
    let phase: "search" | "route" | "hold" | "fade" = "search";
    let phaseAt = 0;
    let lastFrame = 0;
    let frame = 0;

    /** Start and goal on opposite sides, so the search crosses the screen and blooms where the copy isn't. */
    const newSearch = () => {
      const { xs, ys, neighbours } = streets;
      const flip = pickPoints() < 0.5;
      const inBand = (k: number, from: number, to: number) =>
        xs[k] > width * from && xs[k] < width * to && ys[k] > height * 0.15 && ys[k] < height * 0.85;
      for (let tries = 0; tries < 2000; tries++) {
        const a = Math.floor(pickPoints() * xs.length);
        const b = Math.floor(pickPoints() * xs.length);
        if (neighbours[a].length === 0 || neighbours[b].length === 0) continue;
        if (!inBand(a, flip ? 0.62 : 0.06, flip ? 0.94 : 0.38)) continue;
        if (!inBand(b, flip ? 0.06 : 0.62, flip ? 0.38 : 0.94)) continue;
        search = new SteppedSearch(streets, a, b);
        phase = "search";
        return;
      }
      search = new SteppedSearch(streets, 0, xs.length - 1);
      phase = "search";
    };

    const layout = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      streets = buildStreets(width, height);

      // The streets never change, so they're drawn once and copied each frame.
      streetLayer = document.createElement("canvas");
      streetLayer.width = canvas.width;
      streetLayer.height = canvas.height;
      const layer = streetLayer.getContext("2d")!;
      layer.setTransform(dpr, 0, 0, dpr, 0, 0);
      for (const [pairs, alpha, lineWidth] of [
        [streets.minor, STREET_ALPHA, 1],
        [streets.avenues, STREET_ALPHA * 2, 1.4],
      ] as const) {
        layer.strokeStyle = `rgba(255,255,255,${alpha})`;
        layer.lineWidth = lineWidth;
        layer.beginPath();
        for (let e = 0; e < pairs.length; e += 2) {
          layer.moveTo(streets.xs[pairs[e]], streets.ys[pairs[e]]);
          layer.lineTo(streets.xs[pairs[e + 1]], streets.ys[pairs[e + 1]]);
        }
        layer.stroke();
      }
      newSearch();
    };

    const drawPoint = (node: number, color: string, alpha: number) => {
      ctx.fillStyle = color;
      for (const [radius, opacity] of [
        [9, 0.25],
        [3.5, 1],
      ]) {
        ctx.globalAlpha = alpha * opacity;
        ctx.beginPath();
        ctx.arc(streets.xs[node], streets.ys[node], radius, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const draw = (now: number) => {
      const { xs, ys } = streets;
      const seconds = now / 1000;
      const alpha = phase === "fade" ? 1 - Math.min(1, (now - phaseAt) / FADE_MS) : 1;

      ctx.globalAlpha = 1;
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(streetLayer, 0, 0, width, height);

      // One stroke per heat band, rather than one per road.
      ctx.globalAlpha = alpha;
      ctx.lineCap = "round";
      const { exploredFrom, exploredTo, exploredAt } = search;
      HEAT.forEach((band, index) => {
        const minAge = index === 0 ? -Infinity : HEAT[index - 1].maxAge;
        ctx.strokeStyle = band.style;
        ctx.lineWidth = band.width;
        ctx.beginPath();
        for (let e = 0; e < exploredAt.length; e++) {
          const age = seconds - exploredAt[e] / 1000;
          if (age <= minAge || age > band.maxAge) continue;
          ctx.moveTo(xs[exploredFrom[e]], ys[exploredFrom[e]]);
          ctx.lineTo(xs[exploredTo[e]], ys[exploredTo[e]]);
        }
        ctx.stroke();
      });

      const path = search.path;
      if (path && phase !== "search") {
        const drawn = phase === "route" ? Math.min(1, (now - phaseAt) / ROUTE_MS) : 1;
        const upTo = Math.max(1, Math.floor(drawn * (path.length - 1)));
        ctx.strokeStyle = DEFAULT_COLORS.end;
        for (const [lineWidth, opacity] of [
          [8, 0.22],
          [2.4, 1],
        ]) {
          ctx.globalAlpha = alpha * opacity;
          ctx.lineWidth = lineWidth;
          ctx.beginPath();
          ctx.moveTo(xs[path[0]], ys[path[0]]);
          for (let i = 1; i <= upTo; i++) ctx.lineTo(xs[path[i]], ys[path[i]]);
          ctx.stroke();
        }
      }

      drawPoint(search.start, DEFAULT_COLORS.start, alpha);
      drawPoint(search.goal, DEFAULT_COLORS.end, alpha);
    };

    const tick = (now: number) => {
      const elapsed = lastFrame ? Math.min(now - lastFrame, 50) : 16;
      lastFrame = now;
      if (phase === "search") {
        const count = Math.max(1, Math.round(streets.xs.length * EXPANSION_RATE * (elapsed / 1000)));
        search.step(count, now);
        if (search.path) {
          phase = "route";
          phaseAt = now;
        } else if (search.exhausted) newSearch();
      } else if (phase === "route" && now - phaseAt > ROUTE_MS) {
        phase = "hold";
        phaseAt = now;
      } else if (phase === "hold" && now - phaseAt > HOLD_MS) {
        phase = "fade";
        phaseAt = now;
      } else if (phase === "fade" && now - phaseAt > FADE_MS) {
        newSearch();
      }
      draw(now);
      frame = requestAnimationFrame(tick);
    };

    const start = () => {
      layout();
      if (!reducedMotion) {
        frame = requestAnimationFrame(tick);
        return;
      }
      // Explored long enough ago that every road has cooled.
      while (!search.path && !search.exhausted) search.step(10_000, -1e6);
      phase = "hold";
      draw(0);
    };

    start();
    let resizeTimer = 0;
    const onResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        cancelAnimationFrame(frame);
        lastFrame = 0;
        start();
      }, 150);
    };
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(resizeTimer);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden className={className} />;
}
