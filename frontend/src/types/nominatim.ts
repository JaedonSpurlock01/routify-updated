export interface NominatimSuggestion {
  name: string;
  display_name: string;
  type: string;
  osm_id: number;
  osm_type: string;
  boundingbox: [string, string, string, string];
  addresstype: string;
}
