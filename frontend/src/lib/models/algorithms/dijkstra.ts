import { haversineDistance } from "@/lib/utils";
import type { Node } from "../node";
import PathfindingAlgorithm from "./pathfinding-algorithm";

export default class Dijkstra extends PathfindingAlgorithm {
  private queue: Node[];
  private visited: Set<string>;

  constructor() {
    super();
    this.queue = [];
    this.visited = new Set<string>();
    this.predecessors.clear();
  }

  public start(startNode: Node, endNode: Node): void {
    super.start(startNode, endNode);
    this.queue = [startNode];
    this.visited.clear();
    this.predecessors.clear();

    this.graph!.setToInfinity(); // set all distanceFromStart to Infinity for Dijkstra
    startNode.distanceFromStart = 0;
    startNode.distanceToEnd = 0;
  }

  public getFinalDistance(): number {
    return this.finalDistance!;
  }

  /**
   * Executes one step of Dijkstra's algorithm
   * Returns an array of node ID pairs (edges) or single-node updates for visualization
   */
  public nextStep(): Array<string[] | [string]> {
    if (this.queue.length === 0) {
      this.finished = true;
      return [];
    }

    const toBeVisuallyUpdated: Array<string[]> = [];

    // Grab node with smallest distanceFromStart (FIFO for current queue)
    const currentNode = this.queue.shift()!;
    this.visited.add(currentNode.id);

    if (currentNode === this.endNode) {
      this.finalDistance = currentNode.distanceFromStart;
      this.queue = [];
      this.finished = true;
      return [];
    }

    for (const neighbor of currentNode.getNeighbors()) {
      const neighborNode = neighbor.node;
      const beenVisited = this.visited.has(neighborNode.id);

      if (!beenVisited) {
        const tentativeDistance = currentNode.distanceFromStart + neighbor.dist;

        // Relaxation
        if (tentativeDistance < neighborNode.distanceFromStart) {
          neighborNode.distanceFromStart = tentativeDistance;
          this.predecessors.set(neighborNode.id, currentNode.id);

          neighborNode.distanceToEnd =
            haversineDistance(
              neighborNode.lat,
              neighborNode.lon,
              this.endNode!.lat,
              this.endNode!.lon
            ) * 1000;
        }

        if (!this.queue.includes(neighborNode)) {
          this.queue.push(neighborNode);
        }
      }

      toBeVisuallyUpdated.push([currentNode.id, neighborNode.id]);
    }

    // Return nodes/edges to visually update
    if (currentNode.id === this.startNode!.id) {
      return [[currentNode.id]];
    } else {
      toBeVisuallyUpdated.push([
        this.predecessors.get(currentNode.id)!,
        currentNode.id,
      ]);
      return toBeVisuallyUpdated;
    }
  }
}
