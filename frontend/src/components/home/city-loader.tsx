import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useNominatimLookup } from "@/api/nominatim";
import { loadCity, type LoadProgress, type OsmType } from "@/lib/city/load-city";
import { useCity } from "@/lib/state";
import { formatBytes } from "@/lib/utils";
import { Button } from "../ui/button";
import { Progress } from "../ui/progress";

interface CityLoaderProps {
  osmType: OsmType;
  osmId: number;
  /** Known when the city was picked from search; looked up otherwise. */
  name?: string;
  displayName?: string;
  onCancel: () => void;
}

export function CityLoader({
  osmType,
  osmId,
  name,
  displayName,
  onCancel,
}: CityLoaderProps) {
  const navigate = useNavigate();
  const { setCity } = useCity();
  const lookup = useNominatimLookup(osmType, osmId, !name);
  const placeName = name ?? lookup.data?.name ?? "city";
  const placeDisplayName = displayName ?? lookup.data?.display_name ?? placeName;

  const [progress, setProgress] = useState<LoadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [map, setMap] = useState<Awaited<ReturnType<typeof loadCity>> | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setProgress(null);
    setError(null);
    // Deferred a tick so StrictMode's throwaway first mount never hits the network.
    const timer = setTimeout(() => {
      loadCity(osmType, osmId, {
        signal: controller.signal,
        onProgress: setProgress,
      }).then(setMap, (cause: Error) => setError(cause.message));
    });
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [osmType, osmId, attempt]);

  // Hand the finished map over once we also know what to call the place.
  const nameReady = Boolean(name) || !lookup.isPending;
  useEffect(() => {
    if (!map || !nameReady) return;
    setCity({
      map,
      place: { osmType, osmId, name: placeName, displayName: placeDisplayName },
    });
    navigate("/map", { replace: true });
  }, [map, nameReady, setCity, navigate, osmType, osmId, placeName, placeDisplayName]);

  if (error) {
    return (
      <div className="flex flex-col items-center gap-4 px-6 text-center animate-rise-in">
        <p className="text-sm text-red-400 max-w-xs text-pretty">{error}</p>
        <div className="flex gap-2">
          <Button variant="secondary" className="rounded-full" onClick={onCancel}>
            Choose another city
          </Button>
          <Button className="rounded-full" onClick={() => setAttempt((n) => n + 1)}>
            Try again
          </Button>
        </div>
      </div>
    );
  }

  const total = progress?.totalBytes ?? null;
  const downloaded = total !== null && progress!.bytes >= total;

  return (
    <div className="flex flex-col items-center gap-4 w-[300px] animate-rise-in">
      <p className="text-sm text-primary/80 text-center">
        Loading {placeName}
      </p>

      {total !== null ? (
        <Progress value={(progress!.bytes / total) * 100} />
      ) : (
        <div className="bg-primary/20 relative h-2 w-full overflow-hidden rounded-full">
          <div className="bg-primary h-full w-2/5 rounded-full animate-indeterminate" />
        </div>
      )}

      <p className="text-sm text-muted-foreground text-center tabular-nums flex items-center gap-2 min-h-5">
        {!progress ? (
          <>
            <Loader2 className="size-4 animate-spin [animation-duration:0.6s]" />
            Asking OpenStreetMap for the roads…
          </>
        ) : downloaded ? (
          "Building the map…"
        ) : (
          `${formatBytes(progress.bytes)}${total ? ` of ${formatBytes(total)}` : ""}`
        )}
      </p>

      {!progress && (
        <p className="text-xs text-muted-foreground/70 text-center text-pretty">
          A city nobody has opened before can take a minute.
        </p>
      )}

      <Button
        variant="ghost"
        size="sm"
        className="rounded-full text-muted-foreground"
        onClick={onCancel}
      >
        Cancel
      </Button>
    </div>
  );
}
