"use client";

import { useId, useState, useEffect, useRef } from "react";
import { LoaderCircleIcon, MicIcon, SearchIcon } from "lucide-react";

import { Input } from "@/components/ui/input";
import { type NominatimSuggestion } from "@/types/overpass-suggestion";
import { useNominatimSearch } from "@/api/nominatim";
import { AddressIcon } from "./address-icon";

import { suggestedCities } from "@/lib/data/suggested-cities";

export default function SearchBox({
  onResultClick,
}: {
  onResultClick: (result: NominatimSuggestion) => void;
}) {
  const id = useId();
  const [inputValue, setInputValue] = useState<string>("");
  const [debouncedValue, setDebouncedValue] = useState<string>(inputValue);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any | null>(null);
  const [listening, setListening] = useState<boolean>(false);
  const [hasInteracted, setHasInteracted] = useState(false);

  // Debounce input
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(inputValue), 300);
    return () => clearTimeout(handler);
  }, [inputValue]);

  useEffect(() => {
    const SpeechRecognitionClass =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).SpeechRecognition ||
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionClass) return;

    const recognition = new SpeechRecognitionClass();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInputValue(transcript);
      setDebouncedValue(transcript);
    };

    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;
  }, []);

  const handleMicClick = () => {
    if (!recognitionRef.current) return;

    if (!listening) {
      recognitionRef.current.start();
      setListening(true);
    } else {
      recognitionRef.current.stop();
      setListening(false);
    }
  };

  const query = useNominatimSearch(debouncedValue);
  const results = query.data || [];

  return (
    <div className="flex flex-col gap-10 items-center">
      <div className="relative w-[280px] max-w-[280px] md:w-[350px] md:max-w-[350px]">
        <div className="relative z-10 w-full">
          <label htmlFor={id} className="sr-only">
            Search for a city
          </label>
          <Input
            id={id}
            className="peer ps-11 pe-11 py-5 w-full rounded-full !bg-muted"
            placeholder="Enter a city"
            type="search"
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
              if (!hasInteracted) setHasInteracted(true);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                setDebouncedValue(inputValue);
                if (!hasInteracted) setHasInteracted(true);
              }
            }}
          />
          <div className="text-muted-foreground/80 pointer-events-none absolute inset-y-0 start-0 flex items-center justify-center ps-3 peer-disabled:opacity-50">
            {query.isPending ? (
              <LoaderCircleIcon
                className="animate-spin"
                size={20}
                role="status"
                aria-label="Loading..."
              />
            ) : (
              <SearchIcon size={20} aria-hidden="true" />
            )}
          </div>
          <button
            className={`text-muted-foreground/80 hover:text-foreground focus-visible:border-ring focus-visible:ring-ring/50 absolute inset-y-0 end-1 flex h-full w-9 items-center justify-center rounded-e-md transition-[color,box-shadow] outline-none focus:z-10 focus-visible:ring-[3px] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 ${
              listening ? "text-rose-500" : ""
            }`}
            aria-label="Press to speak"
            aria-pressed={listening}
            type="button"
            onClick={handleMicClick}
          >
            <MicIcon size={20} aria-hidden="true" />
          </button>
        </div>

        {results.length > 0 && (
          <div className="-translate-y-12 border border-border -translate-x-[0.5rem] pt-14 px-2 pb-2 -z-10 w-[calc(100%+1rem)] rounded-3xl bg-muted/50">
            <ul
              className="hide-scrollbar max-h-[400px] overflow-y-auto space-y-2"
              role="listbox"
              aria-live="polite"
            >
              {results.map((result) => (
                <li
                  key={result.osm_id}
                  className="hover:bg-muted rounded-xl p-2 cursor-pointer"
                  role="button"
                  tabIndex={0}
                  onClick={() => onResultClick(result)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onResultClick(result);
                    }
                  }}
                >
                  <div className="flex gap-4">
                    <span className="aspect-square size-10 rounded-full flex items-center justify-center bg-muted border border-border">
                      <AddressIcon
                        type={result.addresstype}
                        size={20}
                        className="text-muted-foreground"
                      />
                    </span>
                    <div>
                      <p className="text-sm text-primary/90 text-left">
                        {result.display_name}
                      </p>
                      <small className="text-rose-500">({result.type})</small>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {results.length === 0 &&
          debouncedValue.length > 0 &&
          !query.isPending && (
            <div className="-translate-y-12 border border-border -translate-x-[0.5rem] pt-16 px-4 pb-4 -z-10 w-[calc(100%+1rem)] rounded-3xl bg-muted/50">
              <p className="text-sm text-center">No results found.</p>
            </div>
          )}
      </div>

      {results.length === 0 &&
        debouncedValue.length === 0 &&
        !hasInteracted && (
          <div className="flex flex-col gap-2 items-center w-3/4 md:w-[500px] xl:w-[1000px]">
            <p className="text-muted-foreground text-center text-sm">
              Quick select cities
            </p>

            <ul
              role="listbox"
              aria-live="polite"
              className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 items-center gap-4"
            >
              {suggestedCities.map((city) => (
                <li
                  role="button"
                  key={city.osm_id}
                  className="p-2 pb-4 border border-border rounded-xl h-full bg-muted/50 hover:bg-muted opacity-0 translate-y-2 animate-fade-in"
                  onClick={() => onResultClick(city)}
                >
                  <img
                    src={city.imgSrc}
                    alt={`Image of ${city.display_name}`}
                    className="rounded-lg w-full aspect-square object-cover "
                  />
                  <p className="text-xs text-primary/90 mt-2 pl-1">
                    {city.display_name}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}
    </div>
  );
}
