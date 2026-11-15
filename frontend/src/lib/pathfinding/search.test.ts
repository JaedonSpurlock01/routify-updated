import { describe, expect, test } from "bun:test";
import { CityMapBuilder, nearestNode, type CityMap } from "../city/city-map";
import { ALGORITHMS, createSearch, pathMeters, type AlgorithmId } from "./search";

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
  const search = createSearch(map, algorithm, start, goal);
  const explored: number[] = [];
  let steps = 0;
  while (!search.done) {
    search.step(explored);
    if (++steps > 10_000) throw new Error("search did not terminate");
  }
  return { search, explored, steps };
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
      const { search } = run(map, id, start, goal);
      expect(search.found).toBe(true);
      expectWalk(map, search.path(), start, goal);
    });

    test(`${id} reports no route to an unreachable goal`, () => {
      const { search } = run(map, id, start, index(1000));
      expect(search.found).toBe(false);
      expect(search.path()).toEqual([]);
    });

    test(`${id} handles start === goal`, () => {
      const { search } = run(map, id, start, start);
      expect(search.found).toBe(true);
      expect(search.path()).toEqual([]);
    });
  }

  test("dijkstra and A* agree on the shortest distance", () => {
    const dijkstra = run(map, "dijkstra", start, goal);
    const astar = run(map, "astar", start, goal);
    const shortest = pathMeters(map, dijkstra.search.path());
    expect(pathMeters(map, astar.search.path())).toBeCloseTo(shortest, 3);
    expect(dijkstra.search.path()).toHaveLength(10); // through the grid
    expect(astar.steps).toBeLessThanOrEqual(dijkstra.steps);
  });

  test("bidirectional search finds Dijkstra's distance with less work", () => {
    const dijkstra = run(map, "dijkstra", start, goal);
    const both = run(map, "bidirectional", start, goal);
    expect(pathMeters(map, both.search.path())).toBeCloseTo(
      pathMeters(map, dijkstra.search.path()),
      3
    );
    expect(both.search.path()).toHaveLength(10);
    expect(both.steps).toBeLessThanOrEqual(dijkstra.steps);
  });

  test("bidirectional search is shortest between every pair of nodes", () => {
    for (let from = 0; from < map.nodeCount; from++) {
      for (let to = 0; to < map.nodeCount; to++) {
        const dijkstra = run(map, "dijkstra", from, to).search;
        const both = run(map, "bidirectional", from, to).search;
        expect(both.found).toBe(dijkstra.found);
        if (!both.found) continue;
        expectWalk(map, both.path(), from, to);
        expect(pathMeters(map, both.path())).toBeCloseTo(
          pathMeters(map, dijkstra.path()),
          3
        );
      }
    }
  });

  test("bidirectional search reports each explored line once", () => {
    const { explored } = run(map, "bidirectional", start, goal);
    expect(explored.length).toBeGreaterThan(0);
    expect(new Set(explored).size).toBe(explored.length);
  });

  test("BFS minimises hops, not distance", () => {
    const bfs = run(map, "bfs", start, goal);
    const dijkstra = run(map, "dijkstra", start, goal);
    expect(bfs.search.path()).toHaveLength(2); // the long detour
    expect(pathMeters(map, bfs.search.path())).toBeGreaterThan(
      pathMeters(map, dijkstra.search.path())
    );
  });

  test("only reports real lines as explored", () => {
    const { explored } = run(map, "astar", start, goal);
    expect(explored.length).toBeGreaterThan(0);
    for (const line of explored) expect(line).toBeLessThan(map.lineCount);
  });
});
