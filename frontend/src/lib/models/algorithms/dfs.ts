import type { Node } from "../node";
import PathfindingAlgorithm from "./pathfinding-algorithm";

export default class DFS extends PathfindingAlgorithm {
  private stack: Node[];
  private visited: Set<string>;

  constructor() {
    super();
    this.stack = [];
    this.visited = new Set<string>();
    this.predecessors.clear();
  }

  public start(startNode: Node, endNode: Node): void {
    super.start(startNode, endNode);
    this.stack = [startNode];
    this.visited.clear();
    this.predecessors.clear();
    startNode.distanceFromStart = 0;
    startNode.distanceToEnd = 0;
  }

  /**
   * Executes one step of DFS
   * Returns an array of node ID pairs (edges) or single-node updates for visualization
   */
  public nextStep(): Array<string[] | [string]> {
    if (this.stack.length === 0) {
      this.finished = true;
      return [];
    }

    const toBeVisuallyUpdated: Array<string[]> = [];

    // Grab item from stack (DFS uses LIFO)
    const currentNode = this.stack.pop()!;
    this.visited.add(currentNode.id);

    if (currentNode === this.endNode) {
      this.stack = [];
      this.finished = true;
      return [];
    }

    for (const neighbor of currentNode.getNeighbors()) {
      const neighborNode = neighbor.node;

      if (
        !this.visited.has(neighborNode.id) &&
        !this.stack.includes(neighborNode)
      ) {
        this.stack.push(neighborNode);
        this.predecessors.set(neighborNode.id, currentNode.id);
      } else {
        // Node already visited, but edge may not have been drawn yet
        toBeVisuallyUpdated.push([currentNode.id, neighborNode.id]);
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
