import { describe, expect, test } from "bun:test";
import { CityMapBuilder, nearestNode, type CityMap } from "../city/city-map";
import { ALGORITHMS, pathMeters, runSearch, type AlgorithmId } from "./search";

/**
 * A 6x6 street grid (ids = row * 10 + col) with one long diagonal shortcut
 * road hanging off the side, plus an island the grid cannot reach.
 */
function buildGrid(): { map: CityMap; index: (id: number) => number } {
  const builder = new CityMapBuilder();
  const ids: number[] = [];
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 6; col++) {
      builder.addNode(row * 10 + col, row * 0.01, col * 0.01);
      ids.push(row * 10 + col);
    }
  }
  for (let i = 0; i < 6; i++) {
    builder.addWay([0, 1, 2, 3, 4, 5].map((col) => i * 10 + col));
    builder.addWay([0, 1, 2, 3, 4, 5].map((row) => row * 10 + i));
  }
  builder.addNode(900, 0.02, 0.2);
  builder.addWay([0, 900, 55]); // a detour that is few hops but far
  builder.addNode(1000, 1, 1);
  builder.addNode(1001, 1, 1.01);
  builder.addWay([1000, 1001]);
  ids.push(900, 1000, 1001);
  const position = new Map(ids.map((id, n) => [id, n]));
  return { map: builder.build(), index: (id) => position.get(id)! };
}

function run(map: CityMap, algorithm: AlgorithmId, start: number, goal: number) {
  return runSearch(map, algorithm, start, goal);
}

/** Checks a goal→start line list really is a connected walk between the two. */
function expectWalk(map: CityMap, lines: number[], start: number, goal: number) {
  let at = goal;
  for (const line of lines) {
    const a = map.lineFrom[line];
    const b = map.lineTo[line];
    expect(a === at || b === at).toBe(true);
    at = a === at ? b : a;
  }
  expect(at).toBe(start);
}

describe("CityMapBuilder", () => {
  const { map, index } = buildGrid();

  test("turns ways into one line per segment", () => {
    expect(map.nodeCount).toBe(39);
    expect(map.lineCount).toBe(60 + 2 + 1);
  });

  test("ignores segments whose nodes are missing", () => {
    const builder = new CityMapBuilder();
    builder.addWay([1, 2, 3]);
    builder.addNode(1, 0, 0);
    builder.addNode(2, 0, 0.01);
    expect(builder.build().lineCount).toBe(1);
  });

  test("finds the nearest road node to a scene position", () => {
    const n = index(33);
    expect(nearestNode(map, map.nodeX[n] + 0.01, map.nodeY[n] - 0.01)).toBe(n);
  });
});

describe("Search", () => {
  const { map, index } = buildGrid();
  const start = index(0);
  const goal = index(55);

  for (const { id } of ALGORITHMS) {
    test(`${id} finds a connected route`, () => {
      const trace = run(map, id, start, goal);
      expect(trace.found).toBe(true);
      expectWalk(map, trace.route, start, goal);
    });

    test(`${id} reports no route to an unreachable goal`, () => {
      const trace = run(map, id, start, index(1000));
      expect(trace.found).toBe(false);
      expect(trace.route).toEqual([]);
    });

    test(`${id} handles start === goal`, () => {
      const trace = run(map, id, start, start);
      expect(trace.found).toBe(true);
      expect(trace.route).toEqual([]);
    });
  }

  test("dijkstra and A* agree on the shortest distance", () => {
    const dijkstra = run(map, "dijkstra", start, goal);
    const astar = run(map, "astar", start, goal);
    const shortest = pathMeters(map, dijkstra.route);
    expect(pathMeters(map, astar.route)).toBeCloseTo(shortest, 3);
    expect(dijkstra.route).toHaveLength(10); // through the grid
    expect(astar.expanded).toBeLessThanOrEqual(dijkstra.expanded);
  });

  test("bidirectional search finds Dijkstra's distance with less work", () => {
    const dijkstra = run(map, "dijkstra", start, goal);
    const both = run(map, "bidirectional", start, goal);
    expect(pathMeters(map, both.route)).toBeCloseTo(
      pathMeters(map, dijkstra.route),
      3
    );
    expect(both.route).toHaveLength(10);
    expect(both.expanded).toBeLessThanOrEqual(dijkstra.expanded);
  });

  test("bidirectional search is shortest between every pair of nodes", () => {
    for (let from = 0; from < map.nodeCount; from++) {
      for (let to = 0; to < map.nodeCount; to++) {
        const dijkstra = run(map, "dijkstra", from, to);
        const both = run(map, "bidirectional", from, to);
        expect(both.found).toBe(dijkstra.found);
        if (!both.found) continue;
        expectWalk(map, both.route, from, to);
        expect(pathMeters(map, both.route)).toBeCloseTo(
          pathMeters(map, dijkstra.route),
          3
        );
      }
    }
  });

  test("bidirectional search reports each explored line once", () => {
    const { lines: explored } = run(map, "bidirectional", start, goal);
    expect(explored.length).toBeGreaterThan(0);
    expect(new Set(explored).size).toBe(explored.length);
  });

  test("BFS minimises hops, not distance", () => {
    const bfs = run(map, "bfs", start, goal);
    const dijkstra = run(map, "dijkstra", start, goal);
    expect(bfs.route).toHaveLength(2); // the long detour
    expect(pathMeters(map, bfs.route)).toBeGreaterThan(
      pathMeters(map, dijkstra.route)
    );
  });

  test("only reports real lines as explored", () => {
    const { lines: explored } = run(map, "astar", start, goal);
    expect(explored.length).toBeGreaterThan(0);
    for (const line of explored) expect(line).toBeLessThan(map.lineCount);
  });

  for (const { id } of ALGORITHMS) {
    test(`${id} records a consistent trace`, () => {
      const trace = run(map, id, start, goal);
      expect(trace.algorithm).toBe(id);
      expect(trace.marks).toHaveLength(trace.expanded + 1);
      expect(trace.marks[0]).toBe(0);
      expect(trace.marks[trace.expanded]).toBe(trace.lines.length);
      for (let k = 1; k <= trace.expanded; k++) {
        expect(trace.marks[k]).toBeGreaterThanOrEqual(trace.marks[k - 1]);
      }
      expect(new Set(trace.lines).size).toBe(trace.lines.length);
      expect(trace.meters).toBeCloseTo(pathMeters(map, trace.route), 6);
      expect(trace.computeMs).toBeGreaterThanOrEqual(0);
    });
  }
});
