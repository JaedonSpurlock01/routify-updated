import PathfindingAlgorithm from "./algorithms/pathfinding-algorithm";
import AStar from "./algorithms/astar";
import BFS from "./algorithms/bfs";
import DFS from "./algorithms/dfs";
import Greedy from "./algorithms/greedy";
import Dijkstra from "./algorithms/dijkstra";
import { Node } from "./node";
import { Graph } from "./graph";

export type AlgorithmName =
  | "A* Search"
  | "Breadth-First Search"
  | "Greedy Search"
  | "Depth-First Search"
  | "Dijkstra's Search";

export const AlgorithmNames: AlgorithmName[] = [
  "A* Search",
  "Breadth-First Search",
  "Greedy Search",
  "Depth-First Search",
  "Dijkstra's Search",
  // "Bidirectional (W) Search",
  // "Bidirectional (UW) Search",
];

export default class PathfindingInstance {
  private static instance: PathfindingInstance;

  private startNode: Node | null;
  private endNode: Node | null;
  private graph: Graph | null;
  private finished: boolean;
  private algorithm: PathfindingAlgorithm;

  public constructor() {
    this.startNode = null;
    this.endNode = null;
    this.graph = null;
    this.finished = false;
    this.algorithm = new PathfindingAlgorithm();
  }

  /**
   * Returns the singleton instance of PathfindingInstance
   */
  public static getInstance(): PathfindingInstance {
    if (!PathfindingInstance.instance) {
      PathfindingInstance.instance = new PathfindingInstance();
    }
    return PathfindingInstance.instance;
  }

  public setStartNode(startNode: Node): void {
    this.startNode = startNode;
  }

  public setEndNode(endNode: Node): void {
    this.endNode = endNode;
  }

  public setGraph(graph: Graph): void {
    this.graph = graph;
  }

  public getFinalDistance(): number {
    if (this.algorithm.finalDistance && this.algorithm.finalDistance > 0) {
      return parseFloat(this.algorithm.finalDistance.toFixed(3));
    }
    return -1;
  }

  public getPredecessors(): Map<string, string> | null {
    return this.algorithm.predecessors ?? null;
  }

  public reset(): void {
    this.finished = false;
    this.algorithm = new PathfindingAlgorithm();

    if (this.graph) {
      this.graph.resetVertices();
    }
  }

  public start(algorithmName: AlgorithmName): void {
    this.reset();

    switch (algorithmName) {
      case "A* Search":
        this.algorithm = new AStar();
        break;
      case "Breadth-First Search":
        this.algorithm = new BFS();
        break;
      case "Greedy Search":
        this.algorithm = new Greedy();
        break;
      case "Depth-First Search":
        this.algorithm = new DFS();
        break;
      case "Dijkstra's Search":
        this.algorithm = new Dijkstra();
        break;
      default:
        this.algorithm = new AStar();
    }

    if (!this.graph || !this.startNode || !this.endNode) {
      throw new Error(
        "Graph, startNode, and endNode must be set before starting."
      );
    }

    this.algorithm.setGraph(this.graph);
    this.algorithm.start(this.startNode, this.endNode);
  }

  public nextStep(): Array<string[]> | null {
    const way = this.algorithm.nextStep();
    if (this.algorithm.finished || way.length === 0) {
      this.finished = true;
      return null;
    }
    return way;
  }

  public isFinished(): boolean {
    return this.finished;
  }
}
