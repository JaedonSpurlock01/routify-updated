import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CityLoader } from "@/components/home/city-loader";
import SearchBox from "@/components/home/search-box";
import { StreetSearchBackdrop } from "@/components/home/street-search-backdrop";
import { isOsmType } from "@/lib/city/load-city";
import type { NominatimSuggestion } from "@/types/nominatim";

export default function HomePage() {
  // The selected city lives in the URL so a loading city can be linked to.
  const [params, setParams] = useSearchParams();
  const [picked, setPicked] = useState<NominatimSuggestion | null>(null);

  const osmId = Number(params.get("osm_id"));
  const osmType = params.get("osm_type");
  const hasSelection = isOsmType(osmType) && Number.isSafeInteger(osmId) && osmId > 0;
  const pickedMatches = picked?.osm_id === osmId && picked.osm_type === osmType;

  const onResultClick = (result: NominatimSuggestion) => {
    setPicked(result);
    setParams({ osm_id: String(result.osm_id), osm_type: result.osm_type });
  };

  return (
    // Clip rather than hide: an overflow-hidden box can still be scrolled by
    // focus(), which would shift the page sideways when the loader focuses.
    <div className="relative min-h-dvh overflow-clip bg-[#0d0d0d]">
      <StreetSearchBackdrop className="absolute inset-0 size-full" />
      {/* Darkens the middle so the copy reads over the search. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_38%_42%_at_50%_50%,rgb(13_13_13/0.94),rgb(13_13_13/0.6)_60%,rgb(13_13_13/0.15))]"
      />

      <main className="relative flex min-h-dvh flex-col items-center justify-center px-4 py-20 text-center">
        <img
          src="/logo-dark.svg"
          alt="Routify"
          width={796}
          height={256}
          className="h-auto w-52 sm:w-60"
        />
        <p className="mt-3 mb-10 text-neutral-300 sm:text-lg">
          Watch pathfinding algorithms explore any city.
        </p>

        {hasSelection ? (
          <CityLoader
            key={`${osmType}/${osmId}`}
            osmType={osmType}
            osmId={osmId}
            name={pickedMatches ? picked.name : undefined}
            displayName={pickedMatches ? picked.display_name : undefined}
            onCancel={() => setParams({})}
          />
        ) : (
          <SearchBox onResultClick={onResultClick} />
        )}
      </main>
    </div>
  );
}
