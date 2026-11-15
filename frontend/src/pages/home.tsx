import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CityLoader } from "@/components/home/city-loader";
import { LightRays } from "@/components/home/light-rays";
import SearchBox from "@/components/home/search-box";
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
    <LightRays>
      <main className="min-h-dvh flex flex-col items-center justify-center py-20 md:pt-0">
        <img
          src="/logo-dark.png"
          alt="Routify"
          width={600}
          height={177}
          className="w-48 h-auto"
        />
        <p className="md:text-lg xl:text-xl text-muted-foreground font-light mt-2 mb-10">
          The Ultimate City Pathfinding Visualizer
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
    </LightRays>
  );
}
