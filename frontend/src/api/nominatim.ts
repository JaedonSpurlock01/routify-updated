import { type NominatimSuggestion } from "@/types/overpass-suggestion";
import { useQuery } from "@tanstack/react-query";

export function useNominatimSearch(query: string) {
  return useQuery<NominatimSuggestion[]>({
    queryKey: ["nominatim", query],
    queryFn: async () => {
      if (!query) return [];

      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${query}`
      );
      return res.json();
    },
  });
}

export function useNominatimLookup(
  osm_id: number,
  osm_type: "relation" | "node"
) {
  const type = osm_type === "relation" ? "R" : "N";

  return useQuery<NominatimSuggestion[]>({
    queryKey: ["nominatim-lookup", osm_type, osm_id],
    queryFn: async () => {
      if (!osm_id || !osm_type) return [];

      const res = await fetch(
        `https://nominatim.openstreetmap.org/lookup?osm_ids=${type}${osm_id}&format=json`
      );
      return res.json();
    },
  });
}
