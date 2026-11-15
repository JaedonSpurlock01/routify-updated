import type { CityMap } from "../city/city-map";
import { haversineMeters } from "../geo";

export const ALGORITHMS = [
  { id: "astar", label: "A* Search", short: "A*" },
  { id: "dijkstra", label: "Dijkstra's Search", short: "Dijkstra" },
  { id: "greedy", label: "Greedy Search", short: "Greedy" },
  { id: "bfs", label: "Breadth-First Search", short: "BFS" },
  { id: "dfs", label: "Depth-First Search", short: "DFS" },
] as const;

export type AlgorithmId = (typeof ALGORITHMS)[number]["id"];

export const algorithmInfo = (id: AlgorithmId) => ALGORITHMS.find((a) => a.id === id)!;

// Node states. Unseen is 0, the typed array default.
const OPEN = 1;
const CLOSED = 2;

/**
 * One run of a pathfinding algorithm over a `CityMap`, advanced a node at a
 * time so it can be animated.
 *
 * Call `step` until `done`. Each step expands one node and reports the lines
 * that became fully explored. Afterwards `found` says whether the goal was
 * reached and `path` gives the route.
 */
export class Search {
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

  constructor(map: CityMap, algorithm: AlgorithmId, start: number, goal: number) {
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

  /** Expands one node, appending newly explored line indices to `explored`. */
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

  /** Line indices of the route found, ordered from the goal back to the start. */
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
