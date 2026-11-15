import * as THREE from "three";
import type { Centreline } from "./route-ribbon";

/** Width of the bolt's main channel, and of a fork where it leaves the route, in scene units. */
const CHANNEL_WIDTH = 0.02;
const FORK_WIDTH = 0.016;
/** How far the jagged channel wanders off the route, as a share of the route and clamped. */
const JAG_SHARE = 0.01;
const MIN_JAG = 0.008;
const MAX_JAG = 0.03;
/** About one fork per this much route, within these bounds. */
const ROUTE_PER_FORK = 0.3;
const MIN_FORKS = 2;
const MAX_FORKS = 24;
/** Segments per fork, and how sharply each one may turn (radians). */
const FORK_SEGMENTS = 7;
const FORK_WANDER = 0.55;
/** How long a fork stays lit behind the strike's head, as a share of the route. */
const FORK_FADE_SHARE = 0.3;

const VERTEX = /* glsl */ `
attribute float root;
attribute float kind;
attribute float edge;
varying float vRoot;
varying float vKind;
varying float vEdge;
void main() {
  vRoot = root;
  vKind = kind;
  vEdge = edge;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uHead;
uniform float uLeader;
uniform float uFade;
uniform float uFlash;
varying float vRoot;
varying float vKind;
varying float vEdge;
void main() {
  // Strands light up as the head passes where they leave the route, then die away;
  // the main channel only crackles right at the head. The flash lights everything.
  float since = uHead - vRoot;
  float fade = uFade * mix(0.35, 1.0, vKind);
  float leader = since < 0.0 ? 0.0 : uLeader * exp(-since / fade);
  float strength = leader + uFlash;
  // vEdge can interpolate a hair past ±1; clamp it, since one NaN pixel would black out the whole bloom pass.
  float alpha = clamp(strength, 0.0, 3.0) * sqrt(max(1.0 - abs(vEdge), 0.0));
  if (alpha < 0.004) discard;
  gl_FragColor = vec4(uColor * alpha * (1.0 + strength), 1.0);
  #include <colorspace_fragment>
}`;

/**
 * The bolt that strikes along a found route: a jagged channel wandering
 * either side of the ribbon plus forks branching off it, drawn additively so
 * it only ever brightens what is under it. Invisible except during a strike;
 * `setStrike` drives it from the same head and flash as its `RouteRibbon`.
 */
export class Lightning {
  readonly mesh: THREE.Mesh;

  private readonly geometry: THREE.BufferGeometry;
  private readonly material: THREE.ShaderMaterial;

  constructor(line: Centreline, options: { z: number; color: THREE.Color; seed: number }) {
    const random = mulberry32(options.seed);
    const strands = new Strands(options.z);
    if (line.length > 0) {
      channel(strands, line, random);
      const forks = Math.min(MAX_FORKS, Math.max(MIN_FORKS, Math.round(line.length / ROUTE_PER_FORK)));
      for (let f = 0; f < forks; f++) fork(strands, line, random);
    }
    this.geometry = strands.build();

    this.material = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: {
        uColor: { value: options.color.clone() },
        uHead: { value: 0 },
        uLeader: { value: 0 },
        uFade: { value: Math.max(line.length * FORK_FADE_SHARE, 1e-3) },
        uFlash: { value: 0 },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.mesh.visible = false;
  }

  /** Mirrors `RouteRibbon.setStrike`; hidden whenever there is nothing to show. */
  setStrike(head: number | null, leading: boolean, flash: number): void {
    const u = this.material.uniforms;
    u.uHead.value = head ?? 0;
    u.uLeader.value = leading ? 1 : 0;
    u.uFlash.value = flash;
    this.mesh.visible = leading || flash > 0;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
  }
}

/** The main channel: the route resampled evenly and pushed a random walk's distance either side of it. */
function channel(strands: Strands, line: Centreline, random: () => number): void {
  const step = Math.min(0.06, Math.max(0.015, line.length / 80));
  const jag = Math.min(MAX_JAG, Math.max(MIN_JAG, line.length * JAG_SHARE));
  const steps = Math.max(2, Math.ceil(line.length / step));
  const xs: number[] = [];
  const ys: number[] = [];
  const roots: number[] = [];
  const widths: number[] = [];
  let offset = 0;
  for (let i = 0; i <= steps; i++) {
    const at = (line.length * i) / steps;
    const [x, y, tx, ty] = sampleAt(line, at);
    offset = offset * 0.55 + (random() * 2 - 1) * jag;
    // Pinned to the route at both ends, so the bolt lands on the points.
    const pin = Math.min(1, at / (3 * step), (line.length - at) / (3 * step));
    xs.push(x - ty * offset * pin);
    ys.push(y + tx * offset * pin);
    roots.push(at);
    widths.push(CHANNEL_WIDTH);
  }
  strands.add(xs, ys, roots, widths, 0);
}

/** A fork leaving the route at a random point, angled onwards the way the strike travels. */
function fork(strands: Strands, line: Centreline, random: () => number): void {
  const root = line.length * (0.05 + 0.9 * random());
  const [x, y, tx, ty] = sampleAt(line, root);
  const side = random() < 0.5 ? -1 : 1;
  const heading = Math.atan2(ty, tx) + side * (0.45 + 0.6 * random());
  const length = Math.min(0.5, Math.max(0.06, line.length * (0.03 + 0.06 * random())));
  branch(strands, x, y, heading, length, root, FORK_WIDTH, random, true);
}

function branch(
  strands: Strands,
  x: number,
  y: number,
  heading: number,
  length: number,
  root: number,
  width: number,
  random: () => number,
  mayFork: boolean
): void {
  const xs = [x];
  const ys = [y];
  const segment = length / FORK_SEGMENTS;
  const forkAt = mayFork && random() < 0.55 ? 2 + Math.floor(random() * 3) : -1;
  for (let i = 1; i <= FORK_SEGMENTS; i++) {
    heading += (random() * 2 - 1) * FORK_WANDER;
    xs.push(xs[i - 1] + Math.cos(heading) * segment);
    ys.push(ys[i - 1] + Math.sin(heading) * segment);
    if (i === forkAt) {
      const turn = (random() < 0.5 ? -1 : 1) * (0.4 + 0.4 * random());
      branch(strands, xs[i], ys[i], heading + turn, length * 0.45, root, width * 0.6, random, false);
    }
  }
  // Tapers to a thread at its tip.
  const widths = xs.map((_, i) => width * (1 - 0.85 * (i / FORK_SEGMENTS)));
  strands.add(xs, ys, xs.map(() => root), widths, 1);
}

/** Position and unit direction of travel at `distance` along the centreline. */
function sampleAt(line: Centreline, distance: number): [number, number, number, number] {
  const { xs, ys, along } = line;
  const last = along.length - 1;
  let lo = 0;
  let hi = last;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (along[mid] < distance) lo = mid + 1;
    else hi = mid;
  }
  const i = Math.max(1, lo);
  const a = i - 1;
  const span = along[i] - along[a] || 1;
  const t = Math.min(1, Math.max(0, (distance - along[a]) / span));
  const dx = xs[i] - xs[a];
  const dy = ys[i] - ys[a];
  const len = Math.hypot(dx, dy) || 1;
  return [xs[a] + dx * t, ys[a] + dy * t, dx / len, dy / len];
}

/** Collects polylines of varying width and turns them into one triangle mesh. */
class Strands {
  private positions: number[] = [];
  private roots: number[] = [];
  private kinds: number[] = [];
  private edges: number[] = [];
  private indices: number[] = [];
  private readonly z: number;

  constructor(z: number) {
    this.z = z;
  }

  add(xs: number[], ys: number[], roots: number[], widths: number[], kind: number): void {
    const n = xs.length;
    if (n < 2) return;
    const first = this.positions.length / 3;
    for (let i = 0; i < n; i++) {
      // Average the two neighbouring segments' directions for a joint without gaps.
      const ax = xs[Math.min(i + 1, n - 1)] - xs[Math.max(i - 1, 0)];
      const ay = ys[Math.min(i + 1, n - 1)] - ys[Math.max(i - 1, 0)];
      const len = Math.hypot(ax, ay) || 1;
      const nx = -ay / len;
      const ny = ax / len;
      const half = widths[i] / 2;
      this.positions.push(xs[i] + nx * half, ys[i] + ny * half, this.z, xs[i] - nx * half, ys[i] - ny * half, this.z);
      this.roots.push(roots[i], roots[i]);
      this.kinds.push(kind, kind);
      this.edges.push(1, -1);
    }
    for (let i = 0; i < n - 1; i++) {
      const a = first + i * 2;
      this.indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }

  build(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute("root", new THREE.Float32BufferAttribute(this.roots, 1));
    geometry.setAttribute("kind", new THREE.Float32BufferAttribute(this.kinds, 1));
    geometry.setAttribute("edge", new THREE.Float32BufferAttribute(this.edges, 1));
    geometry.setIndex(this.indices);
    return geometry;
  }
}

/** A small seeded random generator, so a route always gets the same bolt. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
