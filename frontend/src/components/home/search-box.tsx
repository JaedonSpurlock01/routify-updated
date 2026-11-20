import { useEffect, useId, useMemo, useRef, useState } from "react";
import { LoaderCircleIcon, MicIcon, SearchIcon } from "lucide-react";

import { Input } from "@/components/ui/input";
import { type NominatimSuggestion } from "@/types/nominatim";
import { useNominatimSearch } from "@/api/nominatim";
import { isOsmType } from "@/lib/city/load-city";
import { suggestedCities } from "@/lib/data/suggested-cities";
import { cn } from "@/lib/utils";
import { AddressIcon } from "./address-icon";

/** Non-uniform so the chips read as a cascade, not a metronome. */
const STAGGER_MS = [0, 50, 90, 125, 155, 180];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SpeechRecognitionLike = any;

function getSpeechRecognition(): (new () => SpeechRecognitionLike) | undefined {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition;
}

export default function SearchBox({
  onResultClick,
}: {
  onResultClick: (result: NominatimSuggestion) => void;
}) {
  const id = useId();
  const [inputValue, setInputValue] = useState("");
  const [debouncedValue, setDebouncedValue] = useState("");
  const [hasInteracted, setHasInteracted] = useState(false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike>(null);
  const canDictate = useMemo(() => Boolean(getSpeechRecognition()), []);

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(inputValue), 300);
    return () => clearTimeout(handler);
  }, [inputValue]);

  useEffect(() => {
    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event: SpeechRecognitionLike) => {
      const transcript = event.results[0][0].transcript;
      setInputValue(transcript);
      setDebouncedValue(transcript);
      setHasInteracted(true);
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    return () => recognition.abort();
  }, []);

  const handleMicClick = () => {
    if (!recognitionRef.current) return;
    if (listening) recognitionRef.current.stop();
    else recognitionRef.current.start();
    setListening(!listening);
  };

  const query = useNominatimSearch(debouncedValue);
  const searching = debouncedValue.trim().length > 0;
  // Only places with a boundary have a road network we can fetch.
  const results = useMemo(
    () => (searching ? (query.data ?? []) : []).filter((r) => isOsmType(r.osm_type)),
    [searching, query.data]
  );
  const showEmpty = searching && results.length === 0 && !query.isFetching;
  const showPanel = results.length > 0 || showEmpty;

  return (
    <div className="flex flex-col gap-6 items-center">
      <div className="relative w-[calc(100vw-2rem)] max-w-md">
        <div className="relative z-10">
          <label htmlFor={id} className="sr-only">
            Search for a city
          </label>
          <Input
            id={id}
            className="peer h-13 w-full rounded-full border-white/10 !bg-neutral-900/95 ps-11 pe-11 md:text-base [&::-webkit-search-cancel-button]:hidden"
            placeholder="Enter a city"
            type="search"
            autoComplete="off"
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
              setHasInteracted(true);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                setDebouncedValue(inputValue);
                setHasInteracted(true);
              }
            }}
          />
          <div className="text-muted-foreground/80 pointer-events-none absolute inset-y-0 start-0 flex items-center justify-center ps-3">
            {query.isFetching ? (
              <LoaderCircleIcon
                className="animate-spin [animation-duration:0.6s]"
                size={20}
                role="status"
                aria-label="Searching"
              />
            ) : (
              <SearchIcon size={20} aria-hidden="true" />
            )}
          </div>
          {canDictate && (
            <button
              className={cn(
                "text-muted-foreground/80 hover:text-foreground focus-visible:ring-ring/50 absolute inset-y-0 end-1 flex h-full w-9 items-center justify-center rounded-full transition-[color,scale] duration-150 ease-out outline-none focus-visible:ring-[3px] active:scale-90",
                listening && "text-rose-500 hover:text-rose-400"
              )}
              aria-label={listening ? "Stop listening" : "Search by voice"}
              aria-pressed={listening}
              type="button"
              onClick={handleMicClick}
            >
              <MicIcon size={20} aria-hidden="true" />
            </button>
          )}
        </div>

        {showPanel && (
          <div className="absolute -inset-x-2 -top-2 pt-16 px-2 pb-2 rounded-3xl border border-white/10 bg-neutral-900/95 shadow-2xl shadow-black/40 animate-panel-in">
            {showEmpty ? (
              <p className="text-sm text-center text-muted-foreground py-3">
                No cities found.
              </p>
            ) : (
              <ul
                className={cn(
                  "hide-scrollbar max-h-[min(400px,45dvh)] overflow-y-auto space-y-1 transition-opacity duration-150",
                  query.isPlaceholderData && "opacity-60"
                )}
              >
                {results.map((result) => (
                  <li key={`${result.osm_type}${result.osm_id}`}>
                    <button
                      type="button"
                      className="w-full flex gap-4 items-center text-left rounded-2xl p-2 outline-none transition-colors duration-150 hover:bg-muted focus-visible:bg-muted active:bg-muted/70"
                      onClick={() => onResultClick(result)}
                    >
                      <span className="shrink-0 size-10 rounded-full flex items-center justify-center bg-muted border border-border">
                        <AddressIcon
                          type={result.addresstype}
                          size={20}
                          className="text-muted-foreground"
                        />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm text-primary/90 line-clamp-2">
                          {result.display_name}
                        </span>
                        <span className="block text-xs text-rose-400 capitalize">
                          {result.addresstype ?? result.type}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {!hasInteracted && (
        <ul aria-label="Quick select cities" className="flex max-w-xl flex-wrap justify-center gap-2">
          {suggestedCities.map((city, index) => (
            <li
              key={city.osm_id}
              className="animate-rise-in"
              style={{ animationDelay: `${STAGGER_MS[index] ?? 180}ms` }}
            >
              <button
                type="button"
                className="flex items-center gap-2.5 rounded-full border border-white/10 bg-neutral-900/90 p-1 pr-4 text-sm text-neutral-200 outline-none transition-[color,background-color,border-color,scale] duration-150 ease-out hover:border-white/20 hover:bg-neutral-800 hover:text-white focus-visible:ring-[3px] focus-visible:ring-ring/50 active:scale-[0.97]"
                onClick={() => onResultClick(city)}
              >
                <img
                  src={city.imgSrc}
                  alt=""
                  width={32}
                  height={32}
                  decoding="async"
                  className="size-8 rounded-full object-cover"
                />
                {city.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
