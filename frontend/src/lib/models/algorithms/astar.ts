import PathfindingAlgorithm from "./pathfinding-algorithm";
import { Node } from "../node";
import { haversineDistance } from "@/lib/utils";

export default class AStar extends PathfindingAlgorithm {
  private priorityQueue: Node[];
  private visited: Set<string>;

  constructor() {
    super();
    this.priorityQueue = [];
    this.visited = new Set<string>();
    this.predecessors.clear();
    this.finalDistance = -1;
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
    return this.finalDistance ? this.finalDistance : -1;
  }

  /**
   * Executes one step of the A* algorithm
   * Returns an array of node ID pairs that need to be visually updated
   */
  public nextStep(): Array<string[] | [string]> {
    if (this.priorityQueue.length === 0) {
      this.finished = true;
      return [];
    }

    const toBeVisuallyUpdated: Array<string[]> = [];

    // Grab the node with the smallest totalDistance
    const currentNode = this.priorityQueue.reduce(
      (acc, current) =>
        current.totalDistance < acc.totalDistance ? current : acc,
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
      const tentativeDistance = currentNode.distanceFromStart + neighbor.dist;
      const beenVisited = this.visited.has(neighborNode.id);

      if (this.priorityQueue.includes(neighborNode)) {
        if (neighborNode.distanceFromStart <= tentativeDistance) continue;
      } else if (beenVisited) {
        toBeVisuallyUpdated.push([currentNode.id, neighborNode.id]);
        if (neighborNode.distanceFromStart <= tentativeDistance) continue;
        this.visited.delete(neighborNode.id);
        this.priorityQueue.push(neighborNode);
      } else {
        this.priorityQueue.push(neighborNode);
        neighborNode.distanceToEnd =
          haversineDistance(
            neighborNode.lat,
            neighborNode.lon,
            this.endNode!.lat,
            this.endNode!.lon
          ) * 1000;
      }

      neighborNode.distanceFromStart = tentativeDistance;
      this.predecessors.set(neighborNode.id, currentNode.id);
    }

    // Return nodes to visually update
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
