type OverpassNode = {
  type: "node";
  id: number;
  lat: number;
  lon: number;
};

type OverpassWay = {
  type: "way";
  id: number;
  nodes: number[];
};

type OverpassElement = OverpassNode | OverpassWay;

interface OverpassResponse {
  elements: OverpassElement[];
}

interface ParsedNode {
  id: number;
  lat: number;
  lon: number;
}

type ParsedWay = number[];

interface ParsedOverpassData {
  nodes: ParsedNode[];
  ways: ParsedWay[];
}

/**
 * Extracts nodes and ways from Overpass API response.
 *
 * @param jsonData - Raw Overpass response object
 * @returns Object containing nodes and ways arrays
 */
export function parseOverpassResponse(
  jsonData: OverpassResponse
): ParsedOverpassData {
  const nodes: ParsedNode[] = [];
  const ways: ParsedWay[] = [];

  jsonData.elements.forEach((element) => {
    if (element.type === "node") {
      nodes.push({ id: element.id, lat: element.lat, lon: element.lon });
    } else if (element.type === "way") {
      ways.push([...element.nodes]);
    }
  });

  return { nodes, ways };
}

// Returns a json formatted list of nodes and objects
/*
{
  nodes: [
    {id, lat, lon}, {id, lat, lon}, {id, lat, lon}, ...
  ],
  ways: [
    [id, id2, id3], [id, id2, id3]
  ]
}
*/
