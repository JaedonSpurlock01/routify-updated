import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import * as THREE from "three";
import { CityMapBuilder, type CityMap } from "../city/city-map";
import { runSearch, type Trace } from "./search";
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


describe("Visualizer playback controls", () => {
  const map = grid();

  const hex = (color: string) => {
    const c = new THREE.Color(color);
    return [c.r, c.g, c.b].map((v) => v.toFixed(3)).join(",");
  };

  /** What the overlay shows: each drawn line and its colour. */
  function snapshot(visualizer: Visualizer) {
    const colors = visualizer.exploredMesh!.instanceColor!.array;
    const shown = new Map<number, string>();
    visualizer.exploredLines.forEach((line, slot) => {
      expect(shown.has(line)).toBe(false); // each line drawn once
      shown.set(line, [0, 1, 2].map((k) => colors[slot * 3 + k].toFixed(3)).join(","));
    });
    return shown;
  }

  /** What the overlay should show after `k` expansions, worked out from the traces alone. */
  function expected(traces: Trace[], k: number) {
    const by = new Map<number, number>(); // line -> bit per run
    traces.forEach((trace, side) => {
      const until = trace.marks[Math.min(k, trace.expanded)];
      for (let i = 0; i < until; i++) by.set(trace.lines[i], (by.get(trace.lines[i]) ?? 0) | (1 << side));
    });
    const colorOf = (bits: number) =>
      traces.length === 1 || bits === 3
        ? hex(COLORS.search)
        : hex(bits === 1 ? COLORS.compareA : COLORS.compareB);
    return new Map([...by].map(([line, bits]) => [line, colorOf(bits)]));
  }

  /** Plays forward one frame at a time, recording the overlay at each whole cursor. */
  function playRecording(visualizer: Visualizer) {
    const seen = new Map<number, Map<number, string>>();
    while (queued) {
      runFrames(1);
      const { cursor } = visualizer.getProgress()!;
      if (!seen.has(cursor)) seen.set(cursor, snapshot(visualizer));
    }
    return seen;
  }

  test("pause holds the cursor and resume carries on from it", () => {
    const visualizer = placed(map);
    visualizer.start("dijkstra");
    runFrames(3);
    expect(visualizer.pause()).toBe(true);
    expect(visualizer.getState()).toMatchObject({ status: "searching", paused: true });
    const held = visualizer.getProgress()!.cursor;
    expect(queued).toBeNull();
    expect(visualizer.pause()).toBe(false);

    expect(visualizer.resume()).toBe(true);
    expect(visualizer.getState().paused).toBe(false);
    runFrames(1);
    expect(visualizer.getProgress()!.cursor).toBeGreaterThan(held);
    runFrames();
    expect(visualizer.getState().status).toBe("done");
    expect(visualizer.pause()).toBe(false); // nothing left to pause
  });

  test("skip to end finishes the search, then the route draws in", () => {
    const visualizer = placed(map);
    visualizer.start("bfs");
    runFrames(2);
    visualizer.pause();
    visualizer.skipToEnd();
    const { length, cursor } = visualizer.getProgress()!;
    expect(cursor).toBe(length);
    expect(visualizer.getState()).toMatchObject({ status: "tracing", paused: false });
    expect(visualizer.getState().result?.found).toBe(true);
    runFrames(1);
    expect(visualizer.getState().status).toBe("tracing"); // the route takes about a second

    visualizer.skipToEnd(); // again: finish the route too
    expect(visualizer.getState().status).toBe("done");
    expect(queued).toBeNull();
    const [ribbon] = visualizer.routeRibbons;
    const samples = ribbon.mesh.geometry.getAttribute("position").count / 2;
    expect(ribbon.mesh.geometry.drawRange.count).toBe((samples - 1) * 6);
  });

  test("seeking draws exactly what playback drew at that cursor, in both directions", () => {
    for (const [first, second] of [
      ["astar", null],
      ["astar", "bfs"],
      ["bidirectional", "dijkstra"],
    ] as const) {
      const reference = placed(map);
      reference.start(first, second);
      const recorded = playRecording(reference);

      const visualizer = placed(map);
      visualizer.start(first, second);
      runFrames(); // to the end, then scrub back and forth
      const { length } = visualizer.getProgress()!;
      const cursors = [...recorded.keys()];
      const order = [...cursors].reverse().concat(cursors.filter((_, i) => i % 3 === 0));
      const traces = [first, second]
        .filter((id) => id !== null)
        .map((id) => runSearch(map, id, 0, map.nodeCount - 1));
      for (const [cursor, shown] of recorded) expect(shown).toEqual(expected(traces, cursor));
      for (const cursor of order) {
        visualizer.seek(cursor);
        expect(visualizer.getProgress()!.cursor).toBe(cursor);
        expect(snapshot(visualizer)).toEqual(recorded.get(cursor)!);
      }
      visualizer.seek(length);
      expect(snapshot(visualizer)).toEqual(expected(traces, length));
    }
  });

  test("seeking back reopens a finished search, paused, and brings its route back", () => {
    const visualizer = placed(map);
    visualizer.start("astar", "bfs");
    runFrames();
    const done = visualizer.getState().comparison!;
    const { length } = visualizer.getProgress()!;

    visualizer.seek(0);
    expect(visualizer.getState()).toMatchObject({ status: "searching", paused: true });
    expect(visualizer.exploredMesh!.count).toBe(0);
    for (const run of visualizer.getState().comparison!.runs) {
      expect(run).toMatchObject({ phase: "searching", found: false, nodesExpanded: 0 });
    }
    for (const ribbon of visualizer.routeRibbons) expect(ribbon.mesh.geometry.drawRange.count).toBe(0);
    expect(visualizer.getState().comparison!.sharedPathLines).toBe(0);

    visualizer.seek(length);
    const again = visualizer.getState().comparison!;
    expect(visualizer.getState()).toMatchObject({ status: "done", paused: false });
    expect(again.runs).toEqual(done.runs);
    expect(again.sharedLines).toBe(done.sharedLines);
    expect(again.sharedPathLines).toBe(done.sharedPathLines);
  });

  test("seeking while playing keeps playing from the new cursor", () => {
    const visualizer = placed(map);
    visualizer.start("dijkstra");
    runFrames(2);
    visualizer.seek(1);
    expect(visualizer.getState().paused).toBe(false);
    runFrames(1);
    const { cursor } = visualizer.getProgress()!;
    expect(cursor).toBeGreaterThan(1);
    expect(cursor).toBeLessThan(10);
  });

  test("moving the cursor back and forth uploads nothing it already sent", () => {
    const visualizer = placed(map);
    visualizer.start("dijkstra");
    runFrames();
    const matrices = visualizer.exploredMesh!.instanceMatrix;
    matrices.clearUpdateRanges();
    visualizer.seek(0);
    visualizer.seek(visualizer.getProgress()!.length);
    expect(matrices.updateRanges).toHaveLength(0);
  });

  test("stop after a pause leaves nothing paused", () => {
    const visualizer = placed(map);
    visualizer.start("astar");
    runFrames(1);
    visualizer.pause();
    visualizer.stop();
    expect(visualizer.getState()).toMatchObject({ status: "idle", paused: false });
    expect(visualizer.getProgress()).toBeNull();
  });
});
