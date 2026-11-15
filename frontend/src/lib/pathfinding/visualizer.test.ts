import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import * as THREE from "three";
import { CityMapBuilder, type CityMap } from "../city/city-map";
import { runSearch } from "./search";
import { Visualizer } from "./visualizer";

// Drive the animation loop by hand instead of waiting on real frames.
let queued: FrameRequestCallback | null = null;
let clock = 0;
const originalRaf = globalThis.requestAnimationFrame;
const originalCancel = globalThis.cancelAnimationFrame;
beforeAll(() => {
  globalThis.requestAnimationFrame = (cb) => {
    queued = cb;
    return 1;
  };
  globalThis.cancelAnimationFrame = () => {
    queued = null;
  };
});
afterAll(() => {
  globalThis.requestAnimationFrame = originalRaf;
  globalThis.cancelAnimationFrame = originalCancel;
});

/** Runs queued frames, by default until the animation stops asking for more. */
function runFrames(limit = 10_000) {
  for (let i = 0; i < limit && queued; i++) {
    const cb = queued;
    queued = null;
    cb((clock += 16));
  }
  if (limit === 10_000) expect(queued).toBeNull();
}

/** A 12x12 street grid. Nodes are indexed row * 12 + col. */
function grid(): CityMap {
  const builder = new CityMapBuilder();
  for (let row = 0; row < 12; row++)
    for (let col = 0; col < 12; col++) builder.addNode(row * 100 + col, row * 0.01, col * 0.01);
  for (let i = 0; i < 12; i++) {
    builder.addWay([...Array(12).keys()].map((col) => i * 100 + col));
    builder.addWay([...Array(12).keys()].map((row) => row * 100 + i));
  }
  return builder.build();
}

const COLORS = {
  map: "#808080",
  search: "#ffffff",
  path: "#ff0000",
  compareA: "#0000ff",
  compareB: "#ff8000",
};

function placed(map: CityMap) {
  const visualizer = new Visualizer(map, COLORS);
  visualizer.speed = 300; // expansions per second: several frames per search
  const at = (node: number) => visualizer.placePoint(map.nodeX[node], map.nodeY[node]);
  at(0);
  at(map.nodeCount - 1);
  return visualizer;
}

describe("Visualizer comparison", () => {
  const map = grid();

  test("races two algorithms and reports each one's stats", () => {
    const visualizer = placed(map);
    expect(visualizer.start("astar", "bfs")).toBe(true);
    expect(visualizer.getState().status).toBe("searching");
    runFrames();

    const { status, result, comparison } = visualizer.getState();
    expect(status).toBe("done");
    expect(result).toBeNull(); // single-run toast stays quiet
    expect(comparison).not.toBeNull();
    const [a, b] = comparison!.runs;
    expect(a.algorithm).toBe("astar");
    expect(b.algorithm).toBe("bfs");

    const { start, end } = visualizer.getState();
    for (const run of [a, b]) {
      const reference = runSearch(map, run.algorithm, start!.node, end!.node);
      expect(run.phase).toBe("done");
      expect(run.found).toBe(true);
      expect(run.nodesExpanded).toBe(reference.expanded);
      expect(run.meters).toBeCloseTo(reference.meters, 6);
      expect(run.linesExplored).toBeGreaterThan(0);
    }
    expect(comparison!.sharedLines).toBeGreaterThan(0);
    expect(comparison!.sharedLines).toBeLessThanOrEqual(
      Math.min(a.linesExplored, b.linesExplored)
    );
  });

  test("colours lines by which algorithm reached them", () => {
    const visualizer = placed(map);
    visualizer.start("astar", "bfs");
    runFrames();
    const seen = new Set<string>();
    const collect = (colors: ArrayLike<number>) => {
      for (let i = 0; i < colors.length; i += 3) {
        seen.add([0, 1, 2].map((k) => colors[i + k].toFixed(2)).join(","));
      }
    };
    const explored = visualizer.exploredMesh!;
    collect(explored.instanceColor!.array.subarray(0, explored.count * 3));
    for (const ribbon of visualizer.routeRibbons) collect(ribbon.colorArray);
    const key = (hex: string, tint = 0) => {
      const c = new THREE.Color(hex).lerp(new THREE.Color("#ffffff"), tint);
      return [c.r, c.g, c.b].map((v) => v.toFixed(2)).join(",");
    };
    // BFS reaches every road A* does on an open grid, so expect: roads only BFS
    // explored, roads both explored, and each algorithm's (lighter) route.
    expect(seen.has(key(COLORS.compareB))).toBe(true);
    expect(seen.has(key(COLORS.search))).toBe(true);
    expect(seen.has(key(COLORS.compareA, 0.35))).toBe(true);
    expect(seen.has(key(COLORS.compareB, 0.35))).toBe(true);
  });

  test("stop clears the comparison and leaves only the map", () => {
    const visualizer = placed(map);
    visualizer.start("dijkstra", "dfs");
    runFrames(3);
    visualizer.stop();
    expect(visualizer.getState()).toMatchObject({ status: "idle", comparison: null });
    const colors = visualizer.mesh.instanceColor!.array;
    const grey = new Set<number>();
    for (let i = 0; i < map.lineCount * 3; i++) grey.add(Number(colors[i].toFixed(3)));
    expect(grey.size).toBe(1);
    expect(visualizer.exploredMesh!.count).toBe(0);
  });

  test("each frame uploads explored lines as one contiguous range", () => {
    const visualizer = placed(map);
    visualizer.start("bidirectional");
    runFrames(2);
    const explored = visualizer.exploredMesh!;
    expect(explored.count).toBeGreaterThan(0);
    expect(explored.instanceMatrix.updateRanges).toHaveLength(2); // one per frame
    expect(visualizer.mesh.instanceMatrix.updateRanges).toHaveLength(0);
  });

  test("bidirectional matches Dijkstra's route with fewer expansions", () => {
    const visualizer = placed(map);
    visualizer.start("bidirectional", "dijkstra");
    runFrames();
    const [both, dijkstra] = visualizer.getState().comparison!.runs;
    expect(both.found && dijkstra.found).toBe(true);
    expect(both.meters).toBeCloseTo(dijkstra.meters, 6);
    expect(both.nodesExpanded).toBeGreaterThan(0);
    expect(both.nodesExpanded).toBeLessThan(dijkstra.nodesExpanded);
  });

  test("comparing an algorithm with itself is a normal single run", () => {
    const visualizer = placed(map);
    visualizer.start("astar", "astar");
    runFrames();
    expect(visualizer.getState().comparison).toBeNull();
    expect(visualizer.getState().result?.found).toBe(true);
  });
});

describe("Visualizer playback", () => {
  const map = grid();

  test("holds back the result until the search has played out", () => {
    const visualizer = placed(map);
    visualizer.start("dijkstra");
    runFrames(1);
    expect(visualizer.getState()).toMatchObject({ status: "searching", result: null });
    runFrames();
    const { status, result } = visualizer.getState();
    expect(status).toBe("done");
    expect(result?.found).toBe(true);
    expect(result?.computeMs).toBeGreaterThanOrEqual(0);
  });

  test("instant speed draws the whole search and route in one frame", () => {
    const visualizer = placed(map);
    visualizer.speed = Infinity;
    visualizer.start("bfs", "astar");
    runFrames(1);
    expect(queued).toBeNull();
    const { status, comparison } = visualizer.getState();
    expect(status).toBe("done");
    for (const run of comparison!.runs) {
      expect(run.phase).toBe("done");
      expect(run.nodesExpanded).toBe(runSearch(map, run.algorithm, 0, map.nodeCount - 1).expanded);
    }
  });

  test("draws the route as one ribbon with curved turns, removed on stop", () => {
    const visualizer = placed(map);
    visualizer.start("astar");
    runFrames();
    const [ribbon] = visualizer.routeRibbons;
    expect(visualizer.routeRibbons).toHaveLength(1);
    const route = runSearch(map, "astar", 0, map.nodeCount - 1).route;
    const geometry = ribbon.mesh.geometry;
    const samples = geometry.getAttribute("position").count / 2;
    // A corner-to-corner route on a grid turns, and each turn adds curve samples.
    expect(samples).toBeGreaterThan(route.length + 1);
    expect(geometry.drawRange.count).toBe((samples - 1) * 6);
    expect(ribbon.mesh.parent).toBe(visualizer.object);

    visualizer.stop();
    expect(visualizer.routeRibbons).toHaveLength(0);
    expect(ribbon.mesh.parent).toBeNull();
  });

  test("a faster speed finishes in fewer frames", () => {
    const frames = (speed: number) => {
      const visualizer = placed(map);
      visualizer.speed = speed;
      visualizer.start("dijkstra");
      let count = 0;
      while (visualizer.getState().status === "searching") {
        runFrames(1);
        count++;
      }
      visualizer.stop();
      return count;
    };
    expect(frames(3000)).toBeLessThan(frames(300));
  });
});

