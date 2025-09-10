import { Node } from "./node";

export class Graph {
  private static instance: Graph;

  private vertices: Map<string, Node>;
  private verticesCount: number;
  private edgeCount: number;
  private algorithmSpeed: number;

  public constructor() {
    this.vertices = new Map<string, Node>();
    this.verticesCount = 0;
    this.edgeCount = 0;
    this.algorithmSpeed = 10;
  }

  public static getInstance(): Graph {
    if (!Graph.instance) {
      Graph.instance = new Graph();
    }
    return Graph.instance;
  }

  public setAlgorithmSpeed(num: number): void {
    this.algorithmSpeed = num;
  }

  public getAlgorithmSpeed(): number {
    return this.algorithmSpeed;
  }

  public resetVertices(): void {
    this.vertices.forEach((vertex) => vertex.reset());
  }

  public setToInfinity(): void {
    this.vertices.forEach((vertex) => {
      vertex.distanceFromStart = Infinity;
    });
  }

  public getVertexCount(): number {
    return this.vertices.size;
  }

  public addVertex(nodeID: string, lat: number, lon: number): void {
    if (!this.vertices.has(nodeID)) {
      const newNode = new Node(nodeID, lat, lon);
      this.vertices.set(nodeID, newNode);
      this.verticesCount++;
    }
  }

  public addEdge(
    startNodeID: string,
    endNodeID: string,
    distance: number,
    directed: boolean = false
  ): void {
    const startNode = this.vertices.get(startNodeID);
    const endNode = this.vertices.get(endNodeID);
    if (startNode && endNode) {
      startNode.addNeighbor(endNode, distance);
      if (!directed) {
        endNode.addNeighbor(startNode, distance);
      }
      this.edgeCount++;
    }
  }

  public printAll(): void {
    this.vertices.forEach((vertex, key) => {
      console.log(JSON.stringify(key));
      vertex.printNeighbors();
      console.log("\n\n");
    });

    console.log("TOTAL VERTICES:", this.verticesCount);
    console.log("TOTAL EDGES:", this.edgeCount);
  }

  public clearGraph(): void {
    this.vertices.clear();
    this.verticesCount = 0;
    this.edgeCount = 0;
  }

  public getNeighborsOf(vertexKey: string): { node: Node; dist: number }[] {
    const vertex = this.vertices.get(vertexKey);
    return vertex ? vertex.getNeighbors() : [];
  }

  public getVertices(): Map<string, Node> {
    return this.vertices;
  }

  public getVertex(nodeID: string): Node | undefined {
    return this.vertices.get(nodeID);
  }

  public reconstructPath(
    cameFrom: Record<string, string>,
    startKey: string,
    endKey: string
  ): string[] {
    let currentKey = endKey;
    const path: string[] = [];
    while (currentKey !== startKey) {
      path.unshift(currentKey);
      currentKey = cameFrom[currentKey];
    }
    path.unshift(startKey);
    return path;
  }
}
