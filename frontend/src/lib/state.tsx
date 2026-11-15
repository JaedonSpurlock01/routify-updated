/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { CityMap } from "./city/city-map";
import type { OsmType } from "./city/load-city";
import type { AlgorithmId } from "./pathfinding/search";
import type { Visualizer } from "./pathfinding/visualizer";

function useRequired<T>(context: React.Context<T | null>, name: string): T {
  const value = useContext(context);
  if (value === null) throw new Error(`${name} is missing its provider`);
  return value;
}

// ── The loaded city ────────────────────────────────────────────────────────

export interface Place {
  name: string;
  displayName: string;
  osmId: number;
  osmType: OsmType;
}

export interface City {
  place: Place;
  map: CityMap;
}

interface CityContextValue {
  city: City | null;
  setCity: (city: City | null) => void;
}

const CityContext = createContext<CityContextValue | null>(null);

export function CityProvider({ children }: { children: ReactNode }) {
  const [city, setCity] = useState<City | null>(null);
  const value = useMemo(() => ({ city, setCity }), [city]);
  return <CityContext.Provider value={value}>{children}</CityContext.Provider>;
}

export const useCity = () => useRequired(CityContext, "useCity");

// ── Display settings ───────────────────────────────────────────────────────

export const DEFAULT_COLORS = {
  background: "#0d0d0d",
  map: "#83888c",
  search: "#e1faf2",
  path: "#ff5454",
  start: "#42f587",
  end: "#fc2d49",
  /** The two algorithms in a comparison; where both explore, `search` is used. */
  compareA: "#3fb5ff",
  compareB: "#ffa53d",
};

export type Colors = typeof DEFAULT_COLORS;

interface SettingsContextValue {
  colors: Colors;
  setColor: (key: keyof Colors, hex: string) => void;
  bloom: boolean;
  setBloom: (bloom: boolean | ((current: boolean) => boolean)) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [colors, setColors] = useState(DEFAULT_COLORS);
  const [bloom, setBloom] = useState(true);
  const setColor = useCallback(
    (key: keyof Colors, hex: string) =>
      setColors((current) =>
        current[key] === hex ? current : { ...current, [key]: hex }
      ),
    []
  );
  const value = useMemo(
    () => ({ colors, setColor, bloom, setBloom }),
    [colors, setColor, bloom]
  );
  return (
    <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
  );
}

export const useSettings = () => useRequired(SettingsContext, "useSettings");

// ── The map page's visualizer ──────────────────────────────────────────────

interface MapSessionValue {
  visualizer: Visualizer;
  algorithm: AlgorithmId;
  setAlgorithm: (algorithm: AlgorithmId) => void;
  /** A second algorithm to race against `algorithm`, or null to run one. */
  compareAlgorithm: AlgorithmId | null;
  setCompareAlgorithm: (algorithm: AlgorithmId | null) => void;
}

export const MapSessionContext = createContext<MapSessionValue | null>(null);

export const useMapSession = () => useRequired(MapSessionContext, "useMapSession");

export function useVisualizerState() {
  const { visualizer } = useMapSession();
  return useSyncExternalStore(visualizer.subscribe, visualizer.getState);
}
