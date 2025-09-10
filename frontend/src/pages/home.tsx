import { useNominatimLookup } from "@/api/nominatim";
import { OSMDataLoader } from "@/components/city-search/osm-data-loader";
import SearchBox from "@/components/city-search/search-box";
import { GridBeams } from "@/components/magicui/grid-beams";
import { usePlaceContext } from "@/lib/context/context";
import type { NominatimSuggestion } from "@/types/overpass-suggestion";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

export default function HomePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const { setPlace } = usePlaceContext();

  const [suggestion, setSuggestion] = useState<NominatimSuggestion | null>(
    null
  );

  const nomiatimLookupParams = useNominatimLookup(
    suggestion?.osm_id ?? 0,
    "node"
  );

  useEffect(() => {
    if (!params.get("osm_id") || !params.get("osm_type")) {
      setSuggestion(null); // clear suggestion if params are gone
    }

    if (nomiatimLookupParams.data && nomiatimLookupParams.data?.length > 0) {
      setPlace(nomiatimLookupParams.data?.[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, setPlace]);

  const onResultClick = (result: NominatimSuggestion) => {
    setSuggestion(result);
    setPlace(result);
    navigate(`?osm_id=${result.osm_id}&osm_type=${result.osm_type}`);
  };

  const osmIdParam = params.get("osm_id");
  const osmTypeParam = params.get("osm_type");

  const osm_id = suggestion?.osm_id ?? (osmIdParam ? Number(osmIdParam) : null);
  const osm_type = suggestion?.osm_type ?? osmTypeParam ?? null;
  const suggestionScoped = suggestion ?? nomiatimLookupParams.data?.[0];

  const hasData = osm_id !== null && osm_type !== null;

  return (
    <GridBeams>
      <main className="min-h-dvh flex flex-col items-center justify-center *:last:mt-10 py-20 md:pt-0">
        <h1 className="text-3xl md:text-4xl xl:text-5xl font-bold">Routify</h1>
        <p className="md:text-lg xl:text-xl text-muted-foreground font-light mt-2">
          The Ultimate City Pathfinding Visualizer
        </p>

        {hasData ? (
          <OSMDataLoader
            osm_name={suggestionScoped?.name ?? ""}
            osm_id={osm_id}
            osm_type={osm_type}
          />
        ) : (
          <SearchBox onResultClick={onResultClick} />
        )}
      </main>
    </GridBeams>
  );
}
