import { haversineDistance } from "@/lib/utils";
import type { Node } from "../node";
import PathfindingAlgorithm from "./pathfinding-algorithm";

export default class Greedy extends PathfindingAlgorithm {
  private priorityQueue: Node[];
  private visited: Set<string>;

  constructor() {
    super();
    this.priorityQueue = [];
    this.visited = new Set<string>();
    this.predecessors.clear();
  }

  public start(startNode: Node, endNode: Node): void {
    super.start(startNode, endNode);
    this.priorityQueue = [startNode];
    this.visited.clear();
    this.predecessors.clear();
    startNode.distanceFromStart = 0;
    startNode.distanceToEnd = 0;
  }

  public getFinalDistance(): number {
    return this.finalDistance!;
  }

  /**
   * Executes one step of the Greedy Best-First Search algorithm
   * Returns an array of node ID pairs (edges) or single-node updates for visualization
   */
  public nextStep(): Array<string[] | [string]> {
    if (this.priorityQueue.length === 0) {
      this.finished = true;
      return [];
    }

    const toBeVisuallyUpdated: Array<string[]> = [];

    // Grab node with smallest distanceToEnd (Greedy)
    const currentNode = this.priorityQueue.reduce(
      (acc, current) =>
        current.distanceToEnd < acc.distanceToEnd ? current : acc,
      this.priorityQueue[0]
    );

    // Remove from priority queue
    this.priorityQueue.splice(this.priorityQueue.indexOf(currentNode), 1);
    this.visited.add(currentNode.id);

    if (currentNode === this.endNode) {
      this.finalDistance = currentNode.distanceFromStart;
      this.priorityQueue = [];
      this.finished = true;
      return [];
    }

    for (const neighbor of currentNode.getNeighbors()) {
      const neighborNode = neighbor.node;
      const beenVisited = this.visited.has(neighborNode.id);

      if (beenVisited) {
        // Node already visited, but edge may not have been drawn yet
        toBeVisuallyUpdated.push([currentNode.id, neighborNode.id]);
      } else {
        neighborNode.distanceToEnd =
          haversineDistance(
            neighborNode.lat,
            neighborNode.lon,
            this.endNode!.lat,
            this.endNode!.lon
          ) * 1000;
        neighborNode.distanceFromStart =
          currentNode.distanceFromStart + neighbor.dist;
        this.priorityQueue.push(neighborNode);
        this.predecessors.set(neighborNode.id, currentNode.id);
      }
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
