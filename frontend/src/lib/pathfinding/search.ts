import type { CityMap } from "../city/city-map";
import { haversineMeters } from "../geo";

export const ALGORITHMS = [
  { id: "astar", label: "A* Search", short: "A*" },
  { id: "dijkstra", label: "Dijkstra's Search", short: "Dijkstra" },
  { id: "bidirectional", label: "Bidirectional Search", short: "Bidirectional" },
  { id: "greedy", label: "Greedy Search", short: "Greedy" },
  { id: "bfs", label: "Breadth-First Search", short: "BFS" },
  { id: "dfs", label: "Depth-First Search", short: "DFS" },
] as const;

export type AlgorithmId = (typeof ALGORITHMS)[number]["id"];

export const algorithmInfo = (id: AlgorithmId) => ALGORITHMS.find((a) => a.id === id)!;

/** The algorithms that grow a single frontier from the start. */
type SingleFrontierId = Exclude<AlgorithmId, "bidirectional">;

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
  const search: PathSearch =
    algorithm === "bidirectional"
      ? new BidirectionalSearch(map, start, goal)
      : new Search(map, algorithm, start, goal);

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

/** A*, Dijkstra, Greedy, BFS and DFS: one frontier growing from the start. */
class Search implements PathSearch {
  done = false;
  found = false;
  /** Nodes taken off the frontier and expanded so far. */
  expanded = 0;

  private readonly map: CityMap;
  private readonly goal: number;
  private readonly frontier: Frontier;
  /** Dijkstra and A* relax edges; the others take the first route they see. */
  private readonly relaxes: boolean;
  private readonly usesHeuristic: boolean;
  private readonly usesCost: boolean;
  private readonly state: Uint8Array;
  private readonly cost: Float64Array;
  private readonly prevNode: Int32Array;
  private readonly prevLine: Int32Array;

  constructor(map: CityMap, algorithm: SingleFrontierId, start: number, goal: number) {
    this.map = map;
    this.goal = goal;
    this.relaxes = algorithm === "astar" || algorithm === "dijkstra";
    this.usesHeuristic = algorithm === "astar" || algorithm === "greedy";
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
          (this.usesHeuristic ? this.heuristic(next) : 0)
      );
    }
  }

  path(): number[] {
    const lines: number[] = [];
    if (!this.found) return lines;
    for (let n = this.goal; this.prevLine[n] !== -1; n = this.prevNode[n]) {
      lines.push(this.prevLine[n]);
    }
    return lines;
  }

  private heuristic(node: number): number {
    const { nodeLat, nodeLon } = this.map;
    return haversineMeters(
      nodeLat[node],
      nodeLon[node],
      nodeLat[this.goal],
      nodeLon[this.goal]
    );
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
 * Per-node state is stored for both directions in one array each, the goal
 * side's entries offset by `nodeCount`.
 */
class BidirectionalSearch implements PathSearch {
  done = false;
  found = false;
  expanded = 0;

  private readonly map: CityMap;
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

  constructor(map: CityMap, start: number, goal: number) {
    const n = map.nodeCount;
    this.map = map;
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
          this.frontiers[side].push(next, nextCost);
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
    const lines: number[] = [];
    if (!this.found) return lines;
    const { prevNode, prevLine, meeting } = this;
    const n = this.map.nodeCount;

    // The goal's half runs from the meeting node out to the goal, so flip it.
    for (let at = meeting; prevLine[n + at] !== -1; at = prevNode[n + at]) {
      lines.push(prevLine[n + at]);
    }
    lines.reverse();
    for (let at = meeting; prevLine[at] !== -1; at = prevNode[at]) {
      lines.push(prevLine[at]);
    }
    return lines;
  }

  /**
   * Distance of the closest node a direction has yet to expand, or Infinity if
   * it has none. Drops stale entries left behind by re-queued nodes first.
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
