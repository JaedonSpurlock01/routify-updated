export class Node {
  id: string;
  lat: number;
  lon: number;
  neighbors: { node: Node; dist: number }[];
  distanceFromStart: number;
  distanceToEnd: number;
  visited: boolean;

  constructor(nodeID: string, lat: number, lon: number) {
    this.id = nodeID;
    this.lat = lat;
    this.lon = lon;
    this.neighbors = []; // { node: Node, dist: number }
    this.distanceFromStart = 0;
    this.distanceToEnd = 0;
    this.visited = false;
  }

  get totalDistance(): number {
    return this.distanceFromStart + this.distanceToEnd;
  }

  getFinalDistance(): number {
    return this.distanceFromStart;
  }

  getNeighbors(): { node: Node; dist: number }[] {
    return this.neighbors;
  }

  setVisited(value: boolean): void {
    this.visited = value;
  }

  getVisited(): boolean {
    return this.visited;
  }

  addNeighbor(node: Node, distance: number): void {
    this.neighbors.push({ node, dist: distance });
  }

  reset(): void {
    this.distanceFromStart = 0;
    this.distanceToEnd = 0;
    this.visited = false;
  }

  printNeighbors(): void {
    this.neighbors.forEach((vertex) => {
      console.log(
        `Neighbor: ${JSON.stringify(
          vertex.node.createCompositeKey()
        )} =-= Distance: ${vertex.dist}`
      );
    });
  }

  createCompositeKey(): string {
    return `${this.id}-${this.lat}-${this.lon}`;
  }
}
