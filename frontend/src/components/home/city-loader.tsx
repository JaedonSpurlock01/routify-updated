import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useNominatimLookup } from "@/api/nominatim";
import { loadCity, type LoadProgress, type OsmType } from "@/lib/city/load-city";
import { useCity } from "@/lib/state";
import { cn, formatBytes } from "@/lib/utils";
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
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [heartbeat, setHeartbeat] = useState({ count: 0, at: 0 });
  const now = useNow(1000);

  useEffect(() => {
    const controller = new AbortController();
    setProgress(null);
    setError(null);
    setStartedAt(Date.now());
    setHeartbeat({ count: 0, at: 0 });
    // Deferred a tick so StrictMode's throwaway first mount never hits the network.
    const timer = setTimeout(() => {
      loadCity(osmType, osmId, {
        signal: controller.signal,
        onProgress: (next) => {
          setProgress(next);
          if (next.stage === "waiting") {
            setHeartbeat((beat) => ({ count: beat.count + 1, at: Date.now() }));
          }
        },
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

  const stage = progress?.stage ?? "waiting";
  const elapsed = Math.max(0, now - startedAt);
  const silentFor = heartbeat.count > 0 ? now - heartbeat.at : 0;
  const stalled = stage === "waiting" && silentFor > STALL_AFTER_MS;

  return (
    <div className="flex flex-col items-center gap-4 w-[300px] animate-rise-in">
      <p className="text-sm text-primary/80 text-center">
        Loading {placeName}
      </p>

      {progress?.stage === "downloading" && progress.totalBytes !== null ? (
        <Progress value={(progress.bytes / progress.totalBytes) * 100} />
      ) : (
        <div className="bg-primary/20 relative h-2 w-full overflow-hidden rounded-full">
          <div className="bg-primary h-full w-2/5 rounded-full animate-indeterminate" />
        </div>
      )}

      <div className="flex flex-col items-center gap-1.5">
        <p className="text-sm text-muted-foreground text-center tabular-nums flex items-center gap-2 min-h-5">
          {progress?.stage === "downloading" ? (
            <>
              {formatBytes(progress.bytes)}
              {progress.totalBytes !== null && ` of ${formatBytes(progress.totalBytes)}`}
              {progress.bytesPerSecond !== null &&
                ` · ${formatBytes(progress.bytesPerSecond)}/s`}
            </>
          ) : (
            <>
              <Loader2 className="size-4 animate-spin [animation-duration:0.6s]" />
              {stage === "building"
                ? "Building the map…"
                : "Asking OpenStreetMap for the roads…"}
            </>
          )}
        </p>

        <p className="text-xs text-muted-foreground/70 tabular-nums flex items-center gap-1.5">
          {formatElapsed(elapsed)}
          {stage === "waiting" && heartbeat.count > 0 && (
            <>
              <span aria-hidden>·</span>
              <span
                key={heartbeat.count}
                aria-hidden
                className={cn(
                  "size-1.5 rounded-full",
                  stalled ? "bg-amber-400" : "bg-emerald-400 animate-heartbeat"
                )}
              />
              {stalled
                ? `no word from the server for ${formatElapsed(silentFor)}`
                : "server is working on it"}
            </>
          )}
        </p>
      </div>

      {stage === "waiting" && (
        <p className="text-xs text-muted-foreground/70 text-center text-pretty max-w-[280px]">
          {waitingHint(elapsed)}
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

/** Heartbeats arrive every ~2 s; this much silence means something is wrong. */
const STALL_AFTER_MS = 15_000;

/** What to tell someone who has been waiting on Overpass for `elapsed` ms. */
function waitingHint(elapsed: number): string {
  if (elapsed < 20_000) return "A city nobody has opened before can take a minute.";
  if (elapsed < 120_000) {
    return "Big cities take OpenStreetMap a few minutes to gather. Only the first visit is slow; after that it's cached.";
  }
  return "Still going. The largest areas can take up to 15 minutes, so it's fine to leave this tab open.";
}

/** e.g. "0:07", "12:34". */
function formatElapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** The current time, refreshed every `interval` ms. */
function useNow(interval: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(timer);
  }, [interval]);
  return now;
}
