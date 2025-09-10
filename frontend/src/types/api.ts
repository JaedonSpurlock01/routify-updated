export interface JobStatus {
  osm_id: number;
  status: "processing" | "success" | "failure";
  error?: string;
  url?: string;
  timestamp: string;
}

export interface OverpassNode {
  type: "node";
  id: number;
  lat: number;
  lon: number;
}

export interface OverpassWay {
  type: "way";
  ids: number[];
}
