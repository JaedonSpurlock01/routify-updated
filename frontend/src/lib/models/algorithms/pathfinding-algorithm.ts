import { Graph } from "../graph";
import { Node } from "../node";

export default class PathfindingAlgorithm {
  finished: boolean;
  predecessors: Map<string, string>;
  graph?: Graph;
  finalDistance?: number;
  startNode?: Node;
  endNode?: Node;

  constructor() {
    this.finished = false;
    this.predecessors = new Map<string, string>();
  }

  public setGraph(graph: Graph): void {
    this.graph = graph;
  }

  public start(startNode: Node, endNode: Node): void {
    this.finished = false;
    this.startNode = startNode;
    this.endNode = endNode;
    this.predecessors.clear();
  }

  /**
   * Should be implemented in subclasses.
   * Returns the next set of nodes processed in this step
   */
  public nextStep(): Array<string[] | [string]> {
    return [];
  }
}
