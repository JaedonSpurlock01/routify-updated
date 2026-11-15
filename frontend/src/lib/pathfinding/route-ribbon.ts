import * as THREE from "three";
import type { CityMap } from "../city/city-map";

/** How far back from a turn the route starts curving, in scene units. */
const CORNER_CUT = 0.12;
/** Turns gentler than this (radians) are left as they are. */
const MIN_TURN = 0.02;
/** Curve samples per radian of turn, and the most one corner gets. */
const SAMPLES_PER_RADIAN = 6;
const MAX_CORNER_SAMPLES = 16;
/** Longest a corner's miter may stretch, as a multiple of the half-width. */
const MAX_MITER = 2;

/**
 * A route drawn as one continuous ribbon whose turns bend along short curves,
 * instead of a row of separate rectangles meeting at hard corners.
 *
 * Built once for a whole route, in route order (goal back to start), and
 * revealed a route line at a time with `show`. Each route line owns a run of
 * vertices so it can be recoloured on its own, e.g. where two compared routes
 * overlap.
 */
export class RouteRibbon {
  readonly mesh: THREE.Mesh;

  private readonly geometry: THREE.BufferGeometry;
  private readonly colors: THREE.BufferAttribute;
  /** Centreline samples belonging to route lines 0..k, for each k. */
  private readonly samplesThrough: Int32Array;

  constructor(
    map: CityMap,
    route: readonly number[],
    goal: number,
    options: { width: number; z: number; color: THREE.Color; material: THREE.Material }
  ) {
    const points = routePoints(map, route, goal);
    const { xs, ys, owners } = smoothCentreline(points);
    const count = xs.length;

    this.samplesThrough = new Int32Array(route.length);
    for (let i = 0, k = 0; k < route.length; k++) {
      while (i < count && owners[i] <= k) i++;
      this.samplesThrough[k] = i;
    }

    const positions = new Float32Array(count * 2 * 3);
    const half = options.width / 2;
    for (let i = 0; i < count; i++) {
      const [nx, ny, miter] = sampleNormal(xs, ys, i);
      const ox = nx * half * miter;
      const oy = ny * half * miter;
      positions.set([xs[i] + ox, ys[i] + oy, options.z, xs[i] - ox, ys[i] - oy, options.z], i * 6);
    }

    const indices = new Uint32Array(Math.max(count - 1, 0) * 6);
    for (let i = 0; i < count - 1; i++) {
      const a = i * 2;
      indices.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], i * 6);
    }

    const colors = new Float32Array(count * 2 * 3);
    for (let v = 0; v < count * 2; v++) options.color.toArray(colors, v * 3);

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    this.colors = new THREE.BufferAttribute(colors, 3);
    this.geometry.setAttribute("color", this.colors);
    this.geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    this.geometry.setDrawRange(0, 0);

    this.mesh = new THREE.Mesh(this.geometry, options.material);
    this.mesh.frustumCulled = false;
  }

  /** Reveals the first `lines` route lines. */
  show(lines: number): void {
    const samples = lines <= 0 ? 0 : this.samplesThrough[Math.min(lines, this.samplesThrough.length) - 1];
    this.geometry.setDrawRange(0, Math.max(samples - 1, 0) * 6);
  }

  /** Recolours the part of the ribbon drawn for route line `index`. */
  colorLine(index: number, color: THREE.Color): void {
    const from = index === 0 ? 0 : this.samplesThrough[index - 1];
    const to = this.samplesThrough[index];
    for (let v = from * 2; v < to * 2; v++) color.toArray(this.colors.array, v * 3);
    this.colors.needsUpdate = true;
  }

  /** Every vertex colour, for tests. */
  get colorArray(): ArrayLike<number> {
    return this.colors.array;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.geometry.dispose();
  }
}

/** The route's nodes as x,y pairs, walked from the goal along each line. */
function routePoints(map: CityMap, route: readonly number[], goal: number): Float64Array {
  const { nodeX, nodeY, lineFrom, lineTo } = map;
  const points = new Float64Array((route.length + 1) * 2);
  let at = goal;
  if (route.length > 0 && lineFrom[route[0]] !== goal && lineTo[route[0]] !== goal) {
    // Not anchored at the goal: start from whichever end the next line doesn't share.
    const next = route[1];
    at = route.length > 1 && (lineFrom[route[0]] === lineFrom[next] || lineFrom[route[0]] === lineTo[next])
      ? lineTo[route[0]]
      : lineFrom[route[0]];
  }
  points[0] = nodeX[at];
  points[1] = nodeY[at];
  route.forEach((line, i) => {
    at = lineFrom[line] === at ? lineTo[line] : lineFrom[line];
    points[(i + 1) * 2] = nodeX[at];
    points[(i + 1) * 2 + 1] = nodeY[at];
  });
  return points;
}

/**
 * Samples a polyline with each turn replaced by a curve. Every interior point
 * is cut back by up to CORNER_CUT along both of its segments (never more than
 * half a segment, so neighbouring curves can't overlap) and the gap bridged
 * with a quadratic Bézier through the old corner. `owners[i]` is the segment
 * (route line) each sample belongs to; it never decreases.
 */
function smoothCentreline(points: Float64Array) {
  const xs: number[] = [];
  const ys: number[] = [];
  const owners: number[] = [];
  const add = (x: number, y: number, owner: number) => {
    const last = xs.length - 1;
    if (last >= 0 && Math.abs(xs[last] - x) < 1e-9 && Math.abs(ys[last] - y) < 1e-9) return;
    xs.push(x);
    ys.push(y);
    owners.push(owner);
  };

  const n = points.length / 2 - 1; // segments
  add(points[0], points[1], 0);
  for (let i = 1; i < n; i++) {
    const px = points[i * 2 - 2], py = points[i * 2 - 1];
    const cx = points[i * 2], cy = points[i * 2 + 1];
    const qx = points[i * 2 + 2], qy = points[i * 2 + 3];
    const lenIn = Math.hypot(cx - px, cy - py);
    const lenOut = Math.hypot(qx - cx, qy - cy);
    const turn =
      lenIn && lenOut
        ? Math.abs(Math.atan2((cx - px) * (qy - cy) - (cy - py) * (qx - cx), (cx - px) * (qx - cx) + (cy - py) * (qy - cy)))
        : 0;
    if (turn < MIN_TURN) {
      add(cx, cy, i - 1);
      continue;
    }

    const cut = Math.min(CORNER_CUT, lenIn / 2, lenOut / 2);
    const ax = cx - ((cx - px) / lenIn) * cut, ay = cy - ((cy - py) / lenIn) * cut;
    const bx = cx + ((qx - cx) / lenOut) * cut, by = cy + ((qy - cy) / lenOut) * cut;
    const steps = Math.min(MAX_CORNER_SAMPLES, Math.max(2, Math.ceil(turn * SAMPLES_PER_RADIAN)));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const u = 1 - t;
      add(
        u * u * ax + 2 * u * t * cx + t * t * bx,
        u * u * ay + 2 * u * t * cy + t * t * by,
        t <= 0.5 ? i - 1 : i
      );
    }
  }
  add(points[n * 2], points[n * 2 + 1], Math.max(n - 1, 0));
  return { xs, ys, owners };
}

/** Unit normal at a centreline sample, and how far to stretch it so the ribbon keeps its width. */
function sampleNormal(xs: number[], ys: number[], i: number): [number, number, number] {
  const last = xs.length - 1;
  const dir = (a: number, b: number): [number, number] => {
    const dx = xs[b] - xs[a];
    const dy = ys[b] - ys[a];
    const len = Math.hypot(dx, dy) || 1;
    return [dx / len, dy / len];
  };
  if (last < 1) return [0, 1, 1];
  const [ax, ay] = dir(Math.max(i - 1, 0), Math.max(i, 1));
  const [bx, by] = dir(Math.min(i, last - 1), Math.min(i + 1, last));
  let tx = ax + bx;
  let ty = ay + by;
  const len = Math.hypot(tx, ty);
  if (len < 1e-6) {
    // A U-turn: no sensible miter, keep the incoming direction.
    tx = ax;
    ty = ay;
  } else {
    tx /= len;
    ty /= len;
  }
  const cosHalf = tx * ax + ty * ay;
  return [-ty, tx, Math.min(1 / Math.max(cosHalf, 1e-6), MAX_MITER)];
}
