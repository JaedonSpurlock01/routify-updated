import { describe, expect, test } from "bun:test";
import { OverpassStreamParser, type OverpassElement } from "./overpass-stream";

const DOCUMENT = `{
  "version": 0.6,
  "generator": "Overpass API",
  "osm3s": { "copyright": "braces } and ] in \\"strings\\" are fine" },
  "elements": [

{
  "type": "node",
  "id": 1,
  "lat": 1.5,
  "lon": 2.5
},
{
  "type": "node",
  "id": 12345678901,
  "lat": -3,
  "lon": 4
},
{
  "type": "way",
  "id": 9,
  "nodes": [
    1,
    12345678901
  ]
}

  ]
}`;

function parse(text: string, chunkSize: number): OverpassElement[] {
  const elements: OverpassElement[] = [];
  const parser = new OverpassStreamParser((el) => elements.push(el));
  for (let i = 0; i < text.length; i += chunkSize) {
    parser.push(text.slice(i, i + chunkSize));
  }
  parser.finish();
  return elements;
}

describe("OverpassStreamParser", () => {
  const expected = [
    { type: "node", id: 1, lat: 1.5, lon: 2.5 },
    { type: "node", id: 12345678901, lat: -3, lon: 4 },
    { type: "way", id: 9, nodes: [1, 12345678901] },
  ];

  test("yields the same elements however the stream is chunked", () => {
    for (const size of [1, 2, 3, 7, 16, 64, DOCUMENT.length]) {
      expect(parse(DOCUMENT, size)).toEqual(expected);
    }
  });

  test("accepts an empty elements array", () => {
    expect(parse('{"elements": []}', 5)).toEqual([]);
  });

  test("rejects a stream that ends mid-document", () => {
    expect(() => parse(DOCUMENT.slice(0, 200), 10)).toThrow(/cut short/);
  });

  test("surfaces an Overpass timeout remark", () => {
    const doc = `{"elements": [{"type":"node","id":1,"lat":0,"lon":0}],
"remark": "runtime error: Query timed out in \\"query\\" at line 1"}`;
    expect(() => parse(doc, 9)).toThrow(/timed out/);
  });

  test("skips the heartbeat whitespace sent while Overpass works", () => {
    expect(parse(" ".repeat(40) + DOCUMENT, 3)).toEqual(expected);
  });

  test("surfaces an error the API sent after its heartbeats", () => {
    const doc = `     {"error":"The map server is busy right now."}`;
    expect(() => parse(doc, 4)).toThrow("The map server is busy right now.");
  });

  test("rejects a response that is not Overpass JSON", () => {
    expect(() => parse("<html>rate limited</html>", 8)).toThrow(/unexpected/);
  });
});
