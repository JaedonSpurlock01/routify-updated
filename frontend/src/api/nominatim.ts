import { type NominatimSuggestion } from "@/types/nominatim";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

const BASE_URL = "https://nominatim.openstreetmap.org";

async function getJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Nominatim responded with ${res.status}`);
  return res.json();
}

export function useNominatimSearch(query: string) {
  const trimmed = query.trim();
  return useQuery({
    queryKey: ["nominatim", trimmed],
    queryFn: ({ signal }) =>
      getJson<NominatimSuggestion[]>(
        `${BASE_URL}/search?format=json&q=${encodeURIComponent(trimmed)}`,
        signal
      ),
    enabled: trimmed.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
  });
}

/** Looks up a single place, for when a city is opened straight from a link. */
export function useNominatimLookup(
  osmType: string,
  osmId: number,
  enabled: boolean
) {
  return useQuery({
    queryKey: ["nominatim-lookup", osmType, osmId],
    queryFn: async ({ signal }) => {
      const prefix = osmType[0].toUpperCase();
      const results = await getJson<NominatimSuggestion[]>(
        `${BASE_URL}/lookup?osm_ids=${prefix}${osmId}&format=json`,
        signal
      );
      return results[0] ?? null;
    },
    enabled,
    staleTime: Infinity,
  });
}
