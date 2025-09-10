import * as THREE from "three";
import { convertToXY } from "../utils";

export const lineBaseSegment = new THREE.Shape();
lineBaseSegment.moveTo(0, 0.5);
lineBaseSegment.lineTo(1, 0.5);
lineBaseSegment.lineTo(1, -0.5);
lineBaseSegment.lineTo(0, -0.5);
lineBaseSegment.lineTo(0, 0.5);

interface NodeInput {
  id: string;
  lat: number;
  lon: number;
}

interface NodeData {
  projected: [number, number];
  unprojected: [number, number];
}

interface LineSegment {
  x: number;
  y: number;
  length: number;
  dx: number;
  dy: number;
  angle: number;
}

interface AddLineParams {
  x: number;
  y: number;
  z: number;
  angle: number;
  scale: number;
  lineWidth: number;
  colorHex: number;
  index: number;
  mesh: THREE.InstancedMesh;
}

interface UpdateLineParams {
  startID: string;
  endID: string;
  colorHex: number;
  lineWidth: number;
  mesh: THREE.InstancedMesh;
  z: number;
}

export class SceneObject {
  private defaultColor: number;
  private defaultLineWidth: number;
  private lineSegments: Map<string, LineSegment> = new Map();
  private nodes: Map<string, NodeData> = new Map();
  private lineCount = 0;
  private nodeCount = 0;
  private indexReference: Map<string, number> = new Map();
  private center: { x: number; y: number } = { x: 0, y: 0 };

  constructor(defaultColor: number, defaultLineWidth: number) {
    this.defaultColor = defaultColor;
    this.defaultLineWidth = defaultLineWidth;
  }

  addNode(node: NodeInput): void {
    this.nodes.set(node.id, {
      projected: convertToXY(node.lat, node.lon),
      unprojected: [node.lat, node.lon],
    });
    this.nodeCount += 1;
  }

  getNode(nodeID: string): NodeData {
    return this.nodes.get(nodeID) ?? { projected: [0, 0], unprojected: [0, 0] };
  }

  getLineCount(): number {
    return this.lineCount;
  }

  changeColor(newColorHex: number): void {
    this.defaultColor = newColorHex;
  }

  createLineProperty(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    startID: string,
    endID: string
  ): void {
    const startVector = new THREE.Vector3(x1, y1, 0);
    const endVector = new THREE.Vector3(x2, y2, 0);
    const length = endVector.distanceTo(startVector);
    const dx = x2 - x1;
    const dy = y2 - y1;
    const angle = Math.atan2(dy, dx);

    const newKey = `${startID}${endID}`;

    if (!this.indexReference.get(newKey)) {
      this.lineSegments.set(newKey, {
        x: x1 - this.center.x,
        y: y1 - this.center.y,
        length,
        dx,
        dy,
        angle,
      });

      this.indexReference.set(newKey, this.lineCount);
      this.lineCount += 1;
    }
  }

  findNearestNode(
    x: number,
    y: number
  ): {
    id: string;
    x: number;
    y: number;
    lat: number;
    lon: number;
  } | null {
    let nearestNodeID: string | null = null;
    let nearestNodeXY: [number, number] | null = null;
    let nearestNodeLatLon: [number, number] | null = null;
    let minDistance = Infinity;

    this.nodes.forEach((node, key) => {
      const distance = Math.sqrt(
        Math.pow(x - (node.projected[0] - this.center.x), 2) +
          Math.pow(y - (node.projected[1] - this.center.y), 2)
      );

      if (distance < minDistance) {
        minDistance = distance;
        nearestNodeID = key;
        nearestNodeXY = [
          node.projected[0] - this.center.x,
          node.projected[1] - this.center.y,
        ];
        nearestNodeLatLon = [node.unprojected[0], node.unprojected[1]];
      }
    });

    if (!nearestNodeID || !nearestNodeXY || !nearestNodeLatLon) return null;

    return {
      id: nearestNodeID,
      x: nearestNodeXY[0],
      y: nearestNodeXY[1],
      lat: nearestNodeLatLon[0],
      lon: nearestNodeLatLon[1],
    };
  }

  updateScene(
    meshRef: { current: THREE.InstancedMesh | null },
    colorHex: number | null = null,
    lineWidth: number | null = null
  ): void {
    if (!meshRef.current) return;

    const mesh = meshRef.current;

    this.lineSegments.forEach((lineSegment, key) => {
      let index = this.indexReference.get(key);

      if (index === undefined) {
        this.lineCount += 1;
        index = this.lineCount;
        this.indexReference.set(key, index);
      }

      this.addLineToScene({
        x: lineSegment.x,
        y: lineSegment.y,
        z: 0,
        angle: lineSegment.angle,
        scale: lineSegment.length,
        lineWidth: lineWidth ?? this.defaultLineWidth,
        colorHex: colorHex ?? this.defaultColor,
        index,
        mesh,
      });
    });
  }

  calculateMapCenter(): { x: number; y: number } {
    let sumX = 0;
    let sumY = 0;

    this.nodes.forEach((node) => {
      sumX += node.projected[0];
      sumY += node.projected[1];
    });

    this.center = {
      x: sumX / this.nodeCount,
      y: sumY / this.nodeCount,
    };

    return this.center;
  }

  updateLineOnScene({
    startID,
    endID,
    colorHex,
    lineWidth,
    mesh,
    z,
  }: UpdateLineParams): void {
    if (!mesh) return;

    const way = `${startID}${endID}`;
    const reversedWay = `${endID}${startID}`;

    const index =
      this.indexReference.get(way) ?? this.indexReference.get(reversedWay);
    const waySegments = this.lineSegments.get(way);
    const reversedWaySegments = this.lineSegments.get(reversedWay);

    const segment = waySegments ?? reversedWaySegments;
    if (!segment || index === undefined) return;

    this.addLineToScene({
      x: segment.x,
      y: segment.y,
      z,
      angle: segment.angle,
      scale: segment.length,
      lineWidth,
      colorHex,
      index,
      mesh,
    });
  }

  private addLineToScene({
    x,
    y,
    z,
    angle,
    scale,
    lineWidth,
    colorHex,
    index,
    mesh,
  }: AddLineParams): void {
    const tempObject = new THREE.Object3D();
    const tempColor = new THREE.Color();

    tempObject.position.set(x, y, z);
    tempObject.rotation.set(0, 0, angle ?? 0);
    tempObject.scale.set(scale, lineWidth, 1);
    tempObject.updateMatrix();
    mesh.setMatrixAt(index, tempObject.matrix);
    mesh.setColorAt(index, tempColor.setHex(colorHex).clone());

    mesh.instanceColor!.needsUpdate = true;
    mesh.instanceMatrix.needsUpdate = true;
    (mesh.material as THREE.Material).needsUpdate = true;
  }
}
