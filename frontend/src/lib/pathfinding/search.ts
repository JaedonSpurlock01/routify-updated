import type { CityMap } from "../city/city-map";
import { haversineMeters } from "../geo";

export const ALGORITHMS = [
  { id: "astar", label: "A* Search", short: "A*" },
  { id: "bidirectional-astar", label: "Bidirectional A*", short: "Bi-A*" },
  { id: "dijkstra", label: "Dijkstra's Search", short: "Dijkstra" },
  { id: "bidirectional", label: "Bidirectional Dijkstra", short: "Bi-Dijkstra" },
  { id: "bellman-ford", label: "Bellman-Ford", short: "Bellman-Ford" },
  { id: "duan-sssp", label: "Duan et al. SSSP (2025)", short: "Duan SSSP" },
  { id: "weighted-astar", label: "Weighted A*", short: "Weighted A*" },
  { id: "greedy", label: "Greedy Search", short: "Greedy" },
  { id: "beam", label: "Beam Search", short: "Beam" },
  { id: "bfs", label: "Breadth-First Search", short: "BFS" },
  { id: "bidirectional-bfs", label: "Bidirectional BFS", short: "Bi-BFS" },
  { id: "dfs", label: "Depth-First Search", short: "DFS" },
] as const;

export type AlgorithmId = (typeof ALGORITHMS)[number]["id"];

export const algorithmInfo = (id: AlgorithmId) => ALGORITHMS.find((a) => a.id === id)!;

/** The algorithms that grow a single frontier from the start. */
type SingleFrontierId = "astar" | "weighted-astar" | "dijkstra" | "greedy" | "bfs" | "dfs";

/**
 * How much Weighted A* inflates its distance-to-goal estimate. Routes it finds
 * are at most this many times longer than the shortest.
 */
export const WEIGHTED_ASTAR_WEIGHT = 2;

/** How many nodes Beam Search keeps from each layer. */
export const BEAM_WIDTH = 64;

function createSearch(
  map: CityMap,
  algorithm: AlgorithmId,
  start: number,
  goal: number
): PathSearch {
  switch (algorithm) {
    case "bidirectional":
      return new BidirectionalSearch(map, start, goal, false);
    case "bidirectional-astar":
      return new BidirectionalSearch(map, start, goal, true);
    case "bidirectional-bfs":
      return new BidirectionalBfs(map, start, goal);
    case "duan-sssp":
      return new DuanSssp(map, start, goal);
    case "bellman-ford":
      return new BellmanFord(map, start, goal);
    case "beam":
      return new BeamSearch(map, start, goal, BEAM_WIDTH);
    default:
      return new Search(map, algorithm, start, goal);
  }
}

/**
 * The full record of one search, in the order it happened, so it can be
 * played back at any speed after the fact.
 *
 * After `k` expansions the search had explored `lines[0 .. marks[k]]`. So
 * `marks` has `expanded + 1` entries, starting at 0 and ending at
 * `lines.length`.
 */
export interface Trace {
  readonly algorithm: AlgorithmId;
  /** Every explored line, each once, in the order the search explored it. */
  readonly lines: Int32Array;
  /** How many of `lines` had been explored after each number of expansions. */
  readonly marks: Int32Array;
  readonly expanded: number;
  readonly found: boolean;
  /** Route lines, ordered from the goal back to the start; empty when not found. */
  readonly route: readonly number[];
  /** Route length in metres; 0 when not found. */
  readonly meters: number;
  /** Wall-clock time the search itself took. */
  readonly computeMs: number;
}

/** Runs a search from `start` to `goal` to completion and records it. */
export function runSearch(
  map: CityMap,
  algorithm: AlgorithmId,
  start: number,
  goal: number
): Trace {
  const startedAt = performance.now();
  const search = createSearch(map, algorithm, start, goal);

  const lines: number[] = [];
  const marks: number[] = [0];
  while (!search.done) {
    const before = search.expanded;
    search.step(lines);
    // A step can end the search without expanding anything.
    if (search.expanded !== before) marks.push(lines.length);
  }
  const route = search.path();
  const computeMs = performance.now() - startedAt;

  return {
    algorithm,
    lines: Int32Array.from(lines),
    marks: Int32Array.from(marks),
    expanded: search.expanded,
    found: search.found,
    route,
    meters: pathMeters(map, route),
    computeMs,
  };
}

/**
 * One run of a pathfinding algorithm, advanced a node at a time.
 *
 * Call `step` until `done`. Each step expands at most one node and reports the
 * lines that became fully explored. Afterwards `found` says whether the goal
 * was reached and `path` gives the route.
 */
interface PathSearch {
  readonly done: boolean;
  readonly found: boolean;
  /** Nodes taken off the frontier and expanded so far. */
  readonly expanded: number;
  /** Expands one node, appending newly explored line indices to `explored`. */
  step(explored: number[]): void;
  /** Line indices of the route found, ordered from the goal back to the start. */
  path(): number[];
}

// Node states. Unseen is 0, the typed array default.
const OPEN = 1;
const CLOSED = 2;

/**
 * A*, Weighted A*, Dijkstra, Greedy, BFS and DFS: one frontier growing from
 * the start.
 */
class Search implements PathSearch {
  done = false;
  found = false;
  /** Nodes taken off the frontier and expanded so far. */
  expanded = 0;

  private readonly map: CityMap;
  private readonly goal: number;
  private readonly frontier: Frontier;
  /** Dijkstra and the A*s relax edges; the others take the first route they see. */
  private readonly relaxes: boolean;
  /** Multiplier on the distance-to-goal estimate; 0 to ignore it. */
  private readonly weight: number;
  private readonly usesCost: boolean;
  private readonly state: Uint8Array;
  private readonly cost: Float64Array;
  private readonly prevNode: Int32Array;
  private readonly prevLine: Int32Array;

  constructor(map: CityMap, algorithm: SingleFrontierId, start: number, goal: number) {
    this.map = map;
    this.goal = goal;
    this.relaxes =
      algorithm === "astar" || algorithm === "weighted-astar" || algorithm === "dijkstra";
    this.weight =
      algorithm === "astar" || algorithm === "greedy"
        ? 1
        : algorithm === "weighted-astar"
          ? WEIGHTED_ASTAR_WEIGHT
          : 0;
    this.usesCost = this.relaxes;
    this.frontier =
      algorithm === "bfs"
        ? new Queue()
        : algorithm === "dfs"
          ? new Stack()
          : new MinHeap();

    this.state = new Uint8Array(map.nodeCount);
    this.cost = new Float64Array(map.nodeCount).fill(Infinity);
    this.prevNode = new Int32Array(map.nodeCount).fill(-1);
    this.prevLine = new Int32Array(map.nodeCount).fill(-1);

    this.cost[start] = 0;
    this.state[start] = OPEN;
    this.frontier.push(start, 0);
  }

  step(explored: number[]): void {
    if (this.done) return;
    const { state, cost, prevNode, prevLine, frontier, map } = this;

    // Skip stale entries left behind when a node was re-queued with a better cost.
    let node = frontier.pop();
    while (node !== -1 && state[node] === CLOSED) node = frontier.pop();
    if (node === -1) {
      this.done = true;
      return;
    }
    state[node] = CLOSED;
    this.expanded++;

    if (node === this.goal) {
      if (prevLine[node] !== -1) explored.push(prevLine[node]);
      this.done = true;
      this.found = true;
      return;
    }

    const end = map.adjStart[node + 1];
    for (let slot = map.adjStart[node]; slot < end; slot++) {
      const next = map.adjNode[slot];
      const line = map.adjLine[slot];

      if (state[next] === CLOSED) {
        explored.push(line); // both ends expanded
        continue;
      }
      if (!this.relaxes && state[next] === OPEN) continue;

      const nextCost = cost[node] + map.lineMeters[line];
      if (nextCost >= cost[next]) continue;

      cost[next] = nextCost;
      prevNode[next] = node;
      prevLine[next] = line;
      state[next] = OPEN;
      frontier.push(
        next,
        (this.usesCost ? nextCost : 0) +
          (this.weight ? this.weight * crowFlies(map, next, this.goal) : 0)
      );
    }
  }

  path(): number[] {
    return this.found ? walkBack(this.prevNode, this.prevLine, this.goal) : [];
  }
}

/** Straight-line distance between two nodes in metres: never more than by road. */
function crowFlies(map: CityMap, a: number, b: number): number {
  const { nodeLat, nodeLon } = map;
  return haversineMeters(nodeLat[a], nodeLon[a], nodeLat[b], nodeLon[b]);
}

/**
 * Follows predecessor links from `from` back to the root of the search,
 * collecting the lines on the way. `offset` selects one direction's half of
 * arrays shared by a bidirectional search.
 */
function walkBack(
  prevNode: Int32Array,
  prevLine: Int32Array,
  from: number,
  offset = 0
): number[] {
  const lines: number[] = [];
  for (let at = from; prevLine[offset + at] !== -1; at = prevNode[offset + at]) {
    lines.push(prevLine[offset + at]);
  }
  return lines;
}

/**
 * Bellman-Ford, in its queue-based form (often called SPFA). Instead of
 * settling nodes nearest-first like Dijkstra, it relaxes lines in whatever
 * order nodes join the queue, and puts a node back whenever a shorter way to
 * it turns up. Nodes can be expanded many times over, but the route it ends
 * with is the shortest. Unlike Dijkstra it would also cope with negative
 * lengths, which roads never have.
 *
 * Bellman-Ford has no way to know the goal is final until the queue runs dry,
 * so to keep it tractable on a whole city, nodes already at least as far from
 * the start as the best route to the goal are pruned: they cannot be on a
 * shorter route.
 */
class BellmanFord implements PathSearch {
  done = false;
  found = false;
  expanded = 0;

  private readonly map: CityMap;
  private readonly goal: number;
  private readonly queue = new Queue();
  private readonly queued: Uint8Array;
  /** Nodes expanded at least once, so each explored line is reported once. */
  private readonly seen: Uint8Array;
  private readonly cost: Float64Array;
  private readonly prevNode: Int32Array;
  private readonly prevLine: Int32Array;

  constructor(map: CityMap, start: number, goal: number) {
    this.map = map;
    this.goal = goal;
    this.queued = new Uint8Array(map.nodeCount);
    this.seen = new Uint8Array(map.nodeCount);
    this.cost = new Float64Array(map.nodeCount).fill(Infinity);
    this.prevNode = new Int32Array(map.nodeCount).fill(-1);
    this.prevLine = new Int32Array(map.nodeCount).fill(-1);

    this.cost[start] = 0;
    this.queued[start] = 1;
    this.queue.push(start);
  }

  step(explored: number[]): void {
    if (this.done) return;
    const { map, goal, queue, queued, seen, cost, prevNode, prevLine } = this;

    let node: number;
    for (;;) {
      node = queue.pop();
      if (node === -1) {
        this.done = true;
        this.found = cost[goal] < Infinity;
        return;
      }
      queued[node] = 0;
      if (node === goal || cost[node] < cost[goal]) break;
    }
    this.expanded++;
    const firstTime = seen[node] === 0;

    const end = map.adjStart[node + 1];
    for (let slot = map.adjStart[node]; slot < end; slot++) {
      const next = map.adjNode[slot];
      const line = map.adjLine[slot];
      // The later of a line's two ends to be expanded reports it.
      if (firstTime && seen[next] === 1) explored.push(line);

      const nextCost = cost[node] + map.lineMeters[line];
      if (nextCost >= cost[next] || nextCost >= cost[goal]) continue;
      cost[next] = nextCost;
      prevNode[next] = node;
      prevLine[next] = line;
      if (queued[next] === 0) {
        queued[next] = 1;
        queue.push(next);
      }
    }
    seen[node] = 1;
  }

  path(): number[] {
    return this.found ? walkBack(this.prevNode, this.prevLine, this.goal) : [];
  }
}

/**
 * Beam Search: A* that forgets. It works through the map in layers, one hop
 * further from the start each time, and of all the nodes a layer reaches only
 * keeps the `width` most promising (by distance so far plus distance left) to
 * expand next. Everything else is dropped for good, so it is fast and uses
 * little memory, but it can miss the shortest route, or every route, if the
 * beam wanders into a dead end.
 */
class BeamSearch implements PathSearch {
  done = false;
  found = false;
  expanded = 0;

  private readonly map: CityMap;
  private readonly goal: number;
  private readonly width: number;
  private readonly closed: Uint8Array;
  private readonly cost: Float64Array;
  private readonly prevNode: Int32Array;
  private readonly prevLine: Int32Array;
  /** The layer each node was last offered for, so it is offered once per layer. */
  private readonly offeredIn: Int32Array;
  private layer: number[];
  private head = 0;
  private layerIndex = 0;
  /** Nodes the current layer reaches, competing for a place in the next. */
  private offered: number[] = [];

  constructor(map: CityMap, start: number, goal: number, width: number) {
    this.map = map;
    this.goal = goal;
    this.width = width;
    this.closed = new Uint8Array(map.nodeCount);
    this.cost = new Float64Array(map.nodeCount).fill(Infinity);
    this.prevNode = new Int32Array(map.nodeCount).fill(-1);
    this.prevLine = new Int32Array(map.nodeCount).fill(-1);
    this.offeredIn = new Int32Array(map.nodeCount).fill(-1);
    this.cost[start] = 0;
    this.layer = [start];
  }

  step(explored: number[]): void {
    if (this.done) return;
    const { map, closed, cost, prevNode, prevLine, offeredIn } = this;

    if (this.head === this.layer.length) this.nextLayer();
    if (this.head === this.layer.length) {
      this.done = true; // the beam ran into dead ends everywhere
      return;
    }
    const node = this.layer[this.head++];
    closed[node] = 1;
    this.expanded++;

    if (node === this.goal) {
      if (prevLine[node] !== -1) explored.push(prevLine[node]);
      this.done = true;
      this.found = true;
      return;
    }

    const end = map.adjStart[node + 1];
    for (let slot = map.adjStart[node]; slot < end; slot++) {
      const next = map.adjNode[slot];
      const line = map.adjLine[slot];
      if (closed[next] === 1) {
        explored.push(line); // both ends expanded
        continue;
      }
      const nextCost = cost[node] + map.lineMeters[line];
      if (nextCost < cost[next]) {
        cost[next] = nextCost;
        prevNode[next] = node;
        prevLine[next] = line;
      }
      if (offeredIn[next] !== this.layerIndex) {
        offeredIn[next] = this.layerIndex;
        this.offered.push(next);
      }
    }
  }

  path(): number[] {
    return this.found ? walkBack(this.prevNode, this.prevLine, this.goal) : [];
  }

  /** Keeps the most promising of the nodes on offer as the next layer. */
  private nextLayer(): void {
    const { map, closed, cost, goal } = this;
    // Nodes in the layer just finished can be on offer too, already expanded.
    const candidates = this.offered.filter((node) => closed[node] === 0);
    const score = new Map<number, number>();
    for (const node of candidates) {
      score.set(node, cost[node] + crowFlies(map, node, goal));
    }
    candidates.sort((a, b) => score.get(a)! - score.get(b)!);
    this.layer = candidates.slice(0, this.width);
    this.head = 0;
    this.offered = [];
    this.layerIndex++;
  }
}

/**
 * Bidirectional BFS: a breadth-first search from each end, taking turns a
 * whole layer at a time, that stops at the end of the first layer in which
 * they touch. Like BFS it finds the route with the fewest lines, not the
 * shortest in metres, but each side only has to reach about halfway.
 *
 * Per-node state is stored for both directions in one array each, the goal
 * side's entries offset by `nodeCount`.
 */
class BidirectionalBfs implements PathSearch {
  done = false;
  found = false;
  expanded = 0;

  private readonly map: CityMap;
  private readonly queues: readonly [Queue, Queue];
  /** Lines from each end, or -1 while that end's search has not reached it. */
  private readonly hops: Int32Array;
  private readonly prevNode: Int32Array;
  private readonly prevLine: Int32Array;
  /** Nodes expanded by either side, so each explored line is reported once. */
  private readonly seen: Uint8Array;
  private side = 0;
  /** Nodes left in the layer the current side is expanding. */
  private layerLeft = 1;
  /** Fewest lines on a route found so far, and the line where its halves join. */
  private best = Infinity;
  private meetSide = -1;
  private meetNode = -1;
  private meetNext = -1;
  private meetLine = -1;

  constructor(map: CityMap, start: number, goal: number) {
    const n = map.nodeCount;
    this.map = map;
    this.queues = [new Queue(), new Queue()];
    this.hops = new Int32Array(2 * n).fill(-1);
    this.prevNode = new Int32Array(2 * n).fill(-1);
    this.prevLine = new Int32Array(2 * n).fill(-1);
    this.seen = new Uint8Array(n);

    this.hops[start] = 0;
    this.hops[n + goal] = 0;
    this.queues[0].push(start);
    this.queues[1].push(goal);
    if (start === goal) {
      this.done = true;
      this.found = true;
    }
  }

  step(explored: number[]): void {
    if (this.done) return;
    const { map, hops, prevNode, prevLine, seen } = this;
    const n = map.nodeCount;

    if (this.layerLeft === 0) {
      // A layer can hold several meetings, so only stop once it is finished.
      const [fromStart, fromGoal] = this.queues;
      if (this.best < Infinity || fromStart.size === 0 || fromGoal.size === 0) {
        this.done = true;
        this.found = this.best < Infinity;
        return;
      }
      this.side = 1 - this.side;
      this.layerLeft = this.queues[this.side].size;
    }

    const side = this.side;
    const own = side * n;
    const other = n - own;
    const node = this.queues[side].pop();
    this.layerLeft--;
    this.expanded++;
    const firstTime = seen[node] === 0;

    const end = map.adjStart[node + 1];
    for (let slot = map.adjStart[node]; slot < end; slot++) {
      const next = map.adjNode[slot];
      const line = map.adjLine[slot];
      if (firstTime && seen[next] === 1) explored.push(line); // both ends expanded

      if (hops[own + next] === -1) {
        hops[own + next] = hops[own + node] + 1;
        prevNode[own + next] = node;
        prevLine[own + next] = line;
        this.queues[side].push(next);
      }
      if (hops[other + next] !== -1) {
        const through = hops[own + node] + 1 + hops[other + next];
        if (through < this.best) {
          this.best = through;
          this.meetSide = side;
          this.meetNode = node;
          this.meetNext = next;
          this.meetLine = line;
        }
      }
    }
    seen[node] = 1;
  }

  path(): number[] {
    if (!this.found || this.meetLine === -1) return [];
    const { prevNode, prevLine } = this;
    const n = this.map.nodeCount;
    const fromStart = this.meetSide === 0;
    const startEnd = fromStart ? this.meetNode : this.meetNext;
    const goalEnd = fromStart ? this.meetNext : this.meetNode;

    // The goal's half runs from the meeting out to the goal, so flip it.
    const lines = walkBack(prevNode, prevLine, goalEnd, n).reverse();
    lines.push(this.meetLine);
    return lines.concat(walkBack(prevNode, prevLine, startEnd));
  }
}

/**
 * Bidirectional Dijkstra: one Dijkstra search grows from the start and another
 * from the goal, taking turns, and the route is stitched together where they
 * meet. It finds the true shortest route while expanding far fewer nodes than
 * a single Dijkstra search, whose frontier has to cover the whole distance.
 *
 * The first node both searches reach is not necessarily on the shortest route,
 * so the search keeps the best meeting found so far and only stops once the
 * two frontiers' nearest unexpanded distances add up to at least that length:
 * no route still undiscovered could be shorter.
 *
 * With `guided` set it is Bidirectional A* instead: each direction ranks its
 * frontier by distance so far plus half of (straight-line distance to the far
 * end minus straight-line distance back to its own end), so both reach
 * towards each other rather than spreading in circles. Splitting the estimate
 * evenly like this (the "average potential") keeps the two directions
 * consistent with each other, so the same stopping rule as Dijkstra's still
 * holds. Giving each side the plain A* estimate instead would force it to run
 * until one frontier alone passed the best route, which on city grids often
 * costs more than not guiding at all.
 *
 * Per-node state is stored for both directions in one array each, the goal
 * side's entries offset by `nodeCount`.
 */
class BidirectionalSearch implements PathSearch {
  done = false;
  found = false;
  expanded = 0;

  private readonly map: CityMap;
  /** Each direction's own end, then the end it is heading for. */
  private readonly ends: readonly [readonly [number, number], readonly [number, number]];
  private readonly guided: boolean;
  private readonly frontiers: readonly [MinHeap, MinHeap];
  private readonly closed: Uint8Array;
  private readonly cost: Float64Array;
  private readonly prevNode: Int32Array;
  private readonly prevLine: Int32Array;
  /** Which direction expands next: 0 from the start, 1 from the goal. */
  private side = 0;
  /** Length of the best route found so far, and the node where its halves join. */
  private best = Infinity;
  private meeting = -1;

  constructor(map: CityMap, start: number, goal: number, guided: boolean) {
    const n = map.nodeCount;
    this.map = map;
    this.ends = [
      [start, goal],
      [goal, start],
    ];
    this.guided = guided;
    this.frontiers = [new MinHeap(), new MinHeap()];
    this.closed = new Uint8Array(2 * n);
    this.cost = new Float64Array(2 * n).fill(Infinity);
    this.prevNode = new Int32Array(2 * n).fill(-1);
    this.prevLine = new Int32Array(2 * n).fill(-1);

    this.cost[start] = 0;
    this.cost[n + goal] = 0;
    this.frontiers[0].push(start, 0);
    this.frontiers[1].push(goal, 0);
    if (start === goal) {
      this.best = 0;
      this.meeting = start;
    }
  }

  step(explored: number[]): void {
    if (this.done) return;
    const { map, closed, cost, prevNode, prevLine } = this;
    const n = map.nodeCount;

    // Once either direction runs dry it has seen its whole component, and once
    // the frontiers together are at least as far out as the best route, nothing
    // shorter is left to find. Either way the best meeting so far is final.
    // (When guided, the two potentials cancel out in the sum.)
    const nearestFromStart = this.nearest(0);
    const nearestFromGoal = this.nearest(1);
    if (nearestFromStart + nearestFromGoal >= this.best) {
      this.done = true;
      this.found = this.meeting !== -1;
      return;
    }

    const side = this.side;
    this.side = 1 - side;
    const own = side * n;
    const other = n - own;
    const node = this.frontiers[side].pop();
    closed[own + node] = 1;
    this.expanded++;
    // The other direction reported this node's lines if it expanded it first.
    const reports = closed[other + node] === 0;

    const end = map.adjStart[node + 1];
    for (let slot = map.adjStart[node]; slot < end; slot++) {
      const next = map.adjNode[slot];
      const line = map.adjLine[slot];
      const nextClosed = closed[own + next] === 1;

      if (reports && (nextClosed || closed[other + next] === 1)) {
        explored.push(line); // both ends expanded
      }

      if (!nextClosed) {
        const nextCost = cost[own + node] + map.lineMeters[line];
        if (nextCost < cost[own + next]) {
          cost[own + next] = nextCost;
          prevNode[own + next] = node;
          prevLine[own + next] = line;
          this.frontiers[side].push(
            next,
            this.guided ? nextCost + this.potential(side, next) : nextCost
          );
        }
      }

      // Infinity until the other direction has reached `next`.
      const through = cost[own + next] + cost[other + next];
      if (through < this.best) {
        this.best = through;
        this.meeting = next;
      }
    }
  }

  path(): number[] {
    if (!this.found) return [];
    const { prevNode, prevLine, meeting } = this;
    const n = this.map.nodeCount;

    // The goal's half runs from the meeting node out to the goal, so flip it.
    const lines = walkBack(prevNode, prevLine, meeting, n).reverse();
    return lines.concat(walkBack(prevNode, prevLine, meeting));
  }

  /**
   * Bidirectional A*'s estimate for one direction: half of how much further
   * `node` is from the far end than from this side's own end, as the crow
   * flies. The two directions' potentials for a node always sum to zero.
   */
  private potential(side: number, node: number): number {
    const [own, far] = this.ends[side];
    return (crowFlies(this.map, node, far) - crowFlies(this.map, node, own)) / 2;
  }

  /**
   * Priority of the closest node a direction has yet to expand (its distance,
   * plus its potential when guided), or Infinity if it has none. Drops stale entries left behind by re-queued nodes first.
   */
  private nearest(side: number): number {
    const frontier = this.frontiers[side];
    const own = side * this.map.nodeCount;
    for (;;) {
      const node = frontier.peek();
      if (node === -1) return Infinity;
      if (this.closed[own + node] === 0) return frontier.peekPriority();
      frontier.pop();
    }
  }
}

/**
 * A node's place in Duan et al.'s strict order: by distance, then by node
 * index. The paper assumes no two routes are the same length; on a street
 * grid they often are, and an unbroken tie can stall the search for good.
 */
interface Key {
  readonly c: number;
  readonly n: number;
}

const BEYOND_ALL: Key = { c: Infinity, n: 0 };

/** Whether (cost, node) comes strictly before `key`. */
function before(cost: number, node: number, key: Key): boolean {
  return cost < key.c || (cost === key.c && node < key.n);
}

function earlier(a: Key, b: Key): Key {
  return before(a.c, a.n, b) ? a : b;
}

/**
 * Line length as Duan et al. sees it. A zero-length line would let a node
 * depend on another at exactly the same distance, which the tie-break order
 * cannot express, so those count as a millimetre.
 */
function positiveMeters(map: CityMap, line: number): number {
  return Math.max(map.lineMeters[line], 1e-3);
}

/** What one bounded multi-source shortest-path call hands back to its caller. */
interface Bounded {
  /** Every node before this is now complete... */
  readonly bound: Key;
  /** ...and these are those nodes. */
  readonly complete: number[];
}

/**
 * The deterministic single-source shortest path algorithm of Duan, Mao, Mao,
 * Shu and Yin ("Breaking the Sorting Barrier for Directed Single-Source
 * Shortest Paths", 2025): the first to beat Dijkstra's O(m + n log n) on
 * sparse graphs, in O(m log^(2/3) n).
 *
 * Dijkstra spends its log n per node keeping the whole frontier sorted. This
 * algorithm avoids that by never sorting more than it must:
 *
 * - **Bounded multi-source search (BMSSP)**: "settle every node closer than B,
 *   starting from these sources", solved recursively over about
 *   log n / log^(2/3) n levels. Each level pulls a batch of the nearest
 *   sources from a partially sorted queue, hands them to the level below, and
 *   relaxes the lines out of whatever that settles.
 * - **Finding pivots**: before recursing, a few rounds of Bellman-Ford from the
 *   sources settle everything nearby. Only sources that lead on to a large
 *   shortest-path tree ("pivots") go into the queue, shrinking the frontier by
 *   a factor of k.
 * - **Base case**: at the bottom, a tiny Dijkstra settles k + 1 nodes.
 *
 * On the map this looks like Dijkstra's ring broken into bursts: short
 * Bellman-Ford flurries, then the same patch re-relaxed as results pass back
 * up the levels, so nodes are expanded several times each. It finds the true
 * shortest route.
 *
 * Simplifications, none of which change the order nodes are explored in:
 * the paper's block-based queue is a heap here (both pull exactly the M
 * nearest entries), and the graph is not first rewritten to constant degree
 * (roads already have low degree). Ties between equal route lengths are
 * broken by node index rather than the paper's lexicographic path order,
 * which needs every line to have some length; see `positiveMeters`.
 *
 * Being single-source, it would go on to settle the whole city; it stops as
 * soon as the goal is reported complete.
 */
class DuanSssp implements PathSearch {
  done = false;
  found = false;
  expanded = 0;

  private readonly map: CityMap;
  private readonly goal: number;
  /** k: Bellman-Ford rounds when finding pivots, and the base case's size. */
  private readonly k: number;
  /** t: each level down shrinks the work by a factor of 2^t. */
  private readonly t: number;
  private readonly cost: Float64Array;
  private readonly prevNode: Int32Array;
  private readonly prevLine: Int32Array;
  /** Nodes expanded at least once, so each explored line is reported once. */
  private readonly seen: Uint8Array;
  /**
   * Scratch membership marks. A node is in a set when its mark equals that
   * set's stamp, so sets are cleared by taking a fresh stamp. Each array is
   * only used by code that does not recurse while its set is live.
   */
  private readonly inSet: Int32Array;
  private readonly inLayer: Int32Array;
  private readonly isSource: Int32Array;
  private readonly hasParent: Int32Array;
  /** Each level of the recursion keeps its own completed-set marks. */
  private readonly completeAt: Int32Array[] = [];
  private stamp = 0;
  /** Pivot-finding forest: the node each one was reached from. */
  private readonly parent: Int32Array;
  private readonly rootOf: Int32Array;
  private readonly rootStamp: Int32Array;
  private readonly treeSize: Int32Array;
  private readonly run: Generator<void, Bounded, void>;
  /** Where the current step's explored lines go. */
  private out: number[] = [];

  constructor(map: CityMap, start: number, goal: number) {
    const n = map.nodeCount;
    this.map = map;
    this.goal = goal;
    const logN = Math.log2(Math.max(2, n));
    this.k = Math.max(1, Math.floor(Math.cbrt(logN)));
    this.t = Math.max(1, Math.floor(Math.cbrt(logN) ** 2));
    const levels = Math.ceil(logN / this.t);

    this.cost = new Float64Array(n).fill(Infinity);
    this.prevNode = new Int32Array(n).fill(-1);
    this.prevLine = new Int32Array(n).fill(-1);
    this.seen = new Uint8Array(n);
    this.inSet = new Int32Array(n);
    this.inLayer = new Int32Array(n);
    this.isSource = new Int32Array(n);
    this.hasParent = new Int32Array(n);
    this.parent = new Int32Array(n);
    this.rootOf = new Int32Array(n);
    this.rootStamp = new Int32Array(n);
    this.treeSize = new Int32Array(n);
    for (let l = 0; l <= levels; l++) this.completeAt.push(new Int32Array(n));

    this.cost[start] = 0;
    this.run = this.bmssp(levels, BEYOND_ALL, [start]);
    if (start === goal) {
      this.done = true;
      this.found = true;
    }
  }

  step(explored: number[]): void {
    if (this.done) return;
    this.out = explored;
    const before = this.expanded;
    // The generator pauses just before each expansion, so this runs exactly
    // one expansion and whatever bookkeeping follows it.
    while (this.expanded === before && !this.done) {
      if (this.run.next().done) this.done = true;
    }
  }

  path(): number[] {
    return this.found ? walkBack(this.prevNode, this.prevLine, this.goal) : [];
  }

  /** Counts an expansion of `node` and reports the lines it completes. */
  private expand(node: number): void {
    const { map, seen } = this;
    this.expanded++;
    if (seen[node] === 0) {
      const end = map.adjStart[node + 1];
      for (let slot = map.adjStart[node]; slot < end; slot++) {
        if (seen[map.adjNode[slot]] === 1) this.out.push(map.adjLine[slot]);
      }
      seen[node] = 1;
    }
  }

  /**
   * Lowers `next`'s distance if `through` beats it. Ties keep the existing
   * predecessor, so predecessor links can never form a loop.
   */
  private lower(next: number, through: number, node: number, line: number): void {
    if (through < this.cost[next]) {
      this.cost[next] = through;
      this.prevNode[next] = node;
      this.prevLine[next] = line;
    }
  }

  /** Stops the search once the goal is among nodes reported complete. */
  private reportComplete(nodes: readonly number[]): void {
    if (this.done) return;
    for (const node of nodes) {
      if (node === this.goal) {
        this.done = true;
        this.found = true;
        return;
      }
    }
  }

  /**
   * Algorithm 3, BMSSP(l, B, S): settles every node closer than `bound` whose
   * shortest route passes through one of `sources` (all of which are complete
   * or nearer than any other incomplete node), unless that would be more than
   * k * 2^(l t) nodes, in which case it settles the nearest of them and
   * reports a smaller bound.
   */
  private *bmssp(level: number, bound: Key, sources: number[]): Generator<void, Bounded, void> {
    if (level === 0) return yield* this.baseCase(bound, sources);
    const { map, cost, k, t } = this;

    const { pivots, reached } = yield* this.findPivots(bound, sources);
    const queue = new PartialQueue(2 ** ((level - 1) * t), bound);
    let lastBound = bound;
    for (const x of pivots) {
      queue.insert(x, cost[x]);
      lastBound = earlier({ c: cost[x], n: x }, lastBound);
    }

    const marks = this.completeAt[level];
    const mine = ++this.stamp;
    const complete: number[] = [];
    const limit = k * 2 ** (level * t);
    const carried: number[] = [];

    while (complete.length < limit && !queue.empty) {
      const [pulledBound, pulled] = queue.pull();
      const sub = yield* this.bmssp(level - 1, pulledBound, pulled);
      lastBound = sub.bound;
      for (const node of sub.complete) {
        if (marks[node] !== mine) {
          marks[node] = mine;
          complete.push(node);
        }
      }

      // Relax out of everything just settled. Nodes landing beyond what the
      // level below covered go back in the queue; ones it should have reached
      // but left for later are put at the front.
      carried.length = 0;
      for (const node of sub.complete) {
        yield;
        this.expand(node);
        const end = map.adjStart[node + 1];
        for (let slot = map.adjStart[node]; slot < end; slot++) {
          const next = map.adjNode[slot];
          const line = map.adjLine[slot];
          const through = cost[node] + positiveMeters(map, line);
          if (through > cost[next]) continue;
          this.lower(next, through, node, line);
          if (!before(through, next, pulledBound) && before(through, next, bound)) {
            queue.insert(next, through);
          } else if (
            !before(through, next, sub.bound) &&
            before(through, next, pulledBound)
          ) {
            carried.push(next, through);
          }
        }
      }
      for (const x of pulled) {
        if (!before(cost[x], x, sub.bound) && before(cost[x], x, pulledBound)) {
          carried.push(x, cost[x]);
        }
      }
      queue.batchPrepend(carried);
    }

    const settledBound = earlier(lastBound, bound);
    for (const x of reached) {
      if (before(cost[x], x, settledBound) && marks[x] !== mine) {
        marks[x] = mine;
        complete.push(x);
      }
    }
    this.reportComplete(complete);
    return { bound: settledBound, complete };
  }

  /**
   * Algorithm 1, FindPivots(B, S): k rounds of Bellman-Ford from the sources.
   * If that reaches more than k|S| nodes, every source stays a pivot.
   * Otherwise only sources whose shortest-path trees (within what was
   * reached) hold at least k nodes are; everything under the others is
   * already complete.
   */
  private *findPivots(
    bound: Key,
    sources: number[]
  ): Generator<void, { pivots: number[]; reached: number[] }, void> {
    const { map, cost, k, inSet, inLayer, isSource, hasParent, parent } = this;
    const run = ++this.stamp;
    const reached = sources.slice();
    for (const x of sources) {
      inSet[x] = run;
      isSource[x] = run;
    }

    let layer = sources;
    for (let round = 1; round <= k; round++) {
      const layerStamp = ++this.stamp;
      const nextLayer: number[] = [];
      for (const node of layer) {
        yield;
        this.expand(node);
        const end = map.adjStart[node + 1];
        for (let slot = map.adjStart[node]; slot < end; slot++) {
          const next = map.adjNode[slot];
          const line = map.adjLine[slot];
          const through = cost[node] + positiveMeters(map, line);
          if (through > cost[next]) continue;
          const improved = through < cost[next];
          this.lower(next, through, node, line);
          if (!before(through, next, bound)) continue;

          if (isSource[next] !== run && (improved || hasParent[next] !== run)) {
            parent[next] = node;
            hasParent[next] = run;
          }
          if (inLayer[next] !== layerStamp) {
            inLayer[next] = layerStamp;
            nextLayer.push(next);
          }
          if (inSet[next] !== run) {
            inSet[next] = run;
            reached.push(next);
          }
        }
      }
      if (reached.length > k * sources.length) return { pivots: sources, reached };
      layer = nextLayer;
    }

    // Size each source's tree by walking every reached node up to its root.
    const { rootOf, rootStamp, treeSize } = this;
    for (const x of sources) {
      rootOf[x] = x;
      rootStamp[x] = run;
      treeSize[x] = 0;
    }
    const chain: number[] = [];
    for (const x of reached) {
      let at = x;
      while (rootStamp[at] !== run) {
        chain.push(at);
        at = parent[at];
      }
      const root = rootOf[at];
      for (const node of chain) {
        rootOf[node] = root;
        rootStamp[node] = run;
      }
      chain.length = 0;
      treeSize[root]++;
    }
    return { pivots: sources.filter((x) => treeSize[x] >= k), reached };
  }

  /**
   * Algorithm 2, BaseCase(B, S): a Dijkstra search from the sources that stops
   * after k + 1 nodes. If it runs out first, everything it settled is
   * complete below `bound`; otherwise all but the farthest are, below that
   * farthest node's distance.
   */
  private *baseCase(bound: Key, sources: number[]): Generator<void, Bounded, void> {
    const { map, cost, k, inSet } = this;
    const run = ++this.stamp;
    const settled: number[] = [];
    const heap = new KeyHeap();
    for (const x of sources) heap.push(x, cost[x]);

    while (settled.length < k + 1 && !heap.empty) {
      const priority = heap.topValue();
      const node = heap.pop();
      if (inSet[node] === run || priority > cost[node]) continue; // stale
      inSet[node] = run;
      settled.push(node);

      yield;
      this.expand(node);
      const end = map.adjStart[node + 1];
      for (let slot = map.adjStart[node]; slot < end; slot++) {
        const next = map.adjNode[slot];
        const line = map.adjLine[slot];
        const through = cost[node] + positiveMeters(map, line);
        if (through > cost[next] || !before(through, next, bound)) continue;
        this.lower(next, through, node, line);
        if (inSet[next] !== run) heap.push(next, through);
      }
    }

    if (settled.length <= k) {
      this.reportComplete(settled);
      return { bound, complete: settled };
    }
    // Keys are all distinct, so this leaves exactly k complete nodes.
    let farthest: Key = { c: -Infinity, n: 0 };
    for (const node of settled) {
      if (!before(cost[node], node, farthest)) farthest = { c: cost[node], n: node };
    }
    const complete = settled.filter((node) => before(cost[node], node, farthest));
    this.reportComplete(complete);
    return { bound: farthest, complete };
  }
}

/**
 * The queue each BMSSP level pulls its sources from (the paper's Lemma 3.3).
 * Holds at most one entry per node, its smallest value, and hands them out in
 * batches of `batch` nearest, together with the key of the nearest entry
 * left behind, which separates the batch from the rest.
 *
 * The paper builds this from unsorted blocks split at medians, so it never
 * pays to fully sort; a lazily-deleting heap pulls exactly the same batches.
 */
class PartialQueue {
  private readonly heap = new KeyHeap();
  private readonly best = new Map<number, number>();
  private readonly batch: number;
  private readonly bound: Key;

  constructor(batch: number, bound: Key) {
    this.batch = batch;
    this.bound = bound;
  }

  get empty(): boolean {
    return this.best.size === 0;
  }

  insert(node: number, value: number): void {
    const current = this.best.get(node);
    if (current !== undefined && current <= value) return;
    this.best.set(node, value);
    this.heap.push(node, value);
  }

  /** Entries known to come before everything already queued. */
  batchPrepend(pairs: readonly number[]): void {
    for (let i = 0; i < pairs.length; i += 2) this.insert(pairs[i], pairs[i + 1]);
  }

  /**
   * Removes the `batch` nearest entries and returns them with the key of the
   * nearest one left, or the queue's own bound if none is.
   */
  pull(): [Key, number[]] {
    const pulled: number[] = [];
    for (;;) {
      this.dropStale();
      if (this.heap.empty) return [this.bound, pulled];
      if (pulled.length === this.batch) {
        return [{ c: this.heap.topValue(), n: this.heap.topNode() }, pulled];
      }
      const node = this.heap.pop();
      this.best.delete(node);
      pulled.push(node);
    }
  }

  /** Drops superseded entries from the top of the heap. */
  private dropStale(): void {
    while (!this.heap.empty && this.best.get(this.heap.topNode()) !== this.heap.topValue()) {
      this.heap.pop();
    }
  }
}

/** A binary min-heap of nodes ordered by (value, node index). */
class KeyHeap {
  private readonly nodes: number[] = [];
  private readonly values: number[] = [];

  get empty(): boolean {
    return this.nodes.length === 0;
  }

  topNode(): number {
    return this.nodes[0];
  }

  topValue(): number {
    return this.values[0];
  }

  push(node: number, value: number): void {
    const { nodes, values } = this;
    let i = nodes.length;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!KeyHeap.less(value, node, values[parent], nodes[parent])) break;
      nodes[i] = nodes[parent];
      values[i] = values[parent];
      i = parent;
    }
    nodes[i] = node;
    values[i] = value;
  }

  pop(): number {
    const { nodes, values } = this;
    const top = nodes[0];
    const lastNode = nodes.pop()!;
    const lastValue = values.pop()!;
    const size = nodes.length;
    if (size > 0) {
      let i = 0;
      for (;;) {
        let child = 2 * i + 1;
        if (child >= size) break;
        if (
          child + 1 < size &&
          KeyHeap.less(values[child + 1], nodes[child + 1], values[child], nodes[child])
        ) {
          child++;
        }
        if (!KeyHeap.less(values[child], nodes[child], lastValue, lastNode)) break;
        nodes[i] = nodes[child];
        values[i] = values[child];
        i = child;
      }
      nodes[i] = lastNode;
      values[i] = lastValue;
    }
    return top;
  }

  private static less(v1: number, n1: number, v2: number, n2: number): boolean {
    return v1 < v2 || (v1 === v2 && n1 < n2);
  }
}

/** Total length of a route in metres. */
export function pathMeters(map: CityMap, lines: readonly number[]): number {
  let total = 0;
  for (const line of lines) total += map.lineMeters[line];
  return total;
}

interface Frontier {
  push(node: number, priority: number): void;
  /** Next node to expand, or -1 when empty. */
  pop(): number;
}

class Stack implements Frontier {
  private readonly items: number[] = [];
  push(node: number) {
    this.items.push(node);
  }
  pop() {
    return this.items.pop() ?? -1;
  }
}

class Queue implements Frontier {
  private items: number[] = [];
  private head = 0;
  get size() {
    return this.items.length - this.head;
  }
  push(node: number) {
    this.items.push(node);
  }
  pop() {
    if (this.head === this.items.length) return -1;
    const node = this.items[this.head++];
    if (this.head > 4096 && this.head * 2 > this.items.length) {
      this.items = this.items.slice(this.head);
      this.head = 0;
    }
    return node;
  }
}

class MinHeap implements Frontier {
  private readonly nodes: number[] = [];
  private readonly priorities: number[] = [];

  push(node: number, priority: number) {
    const { nodes, priorities } = this;
    let i = nodes.length;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (priorities[parent] <= priority) break;
      nodes[i] = nodes[parent];
      priorities[i] = priorities[parent];
      i = parent;
    }
    nodes[i] = node;
    priorities[i] = priority;
  }

  /** The node `pop` would return, or -1 when empty. */
  peek() {
    return this.nodes.length === 0 ? -1 : this.nodes[0];
  }

  /** Priority of the node `peek` returns. */
  peekPriority() {
    return this.priorities[0];
  }

  pop() {
    const { nodes, priorities } = this;
    if (nodes.length === 0) return -1;
    const top = nodes[0];
    const lastNode = nodes.pop()!;
    const lastPriority = priorities.pop()!;
    const size = nodes.length;
    if (size > 0) {
      let i = 0;
      for (;;) {
        let child = 2 * i + 1;
        if (child >= size) break;
        if (child + 1 < size && priorities[child + 1] < priorities[child]) child++;
        if (priorities[child] >= lastPriority) break;
        nodes[i] = nodes[child];
        priorities[i] = priorities[child];
        i = child;
      }
      nodes[i] = lastNode;
      priorities[i] = lastPriority;
    }
    return top;
  }
}
