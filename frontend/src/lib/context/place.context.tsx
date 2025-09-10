import type { NominatimSuggestion } from "@/types/overpass-suggestion";
import {
  type Dispatch,
  type SetStateAction,
  type ReactNode,
  useState,
} from "react";
import { PlaceContext } from "./context";

interface PlaceContextProviderProps {
  children: ReactNode;
}

export interface PlaceContextValue {
  place: NominatimSuggestion | null;
  setPlace: Dispatch<SetStateAction<NominatimSuggestion | null>>;
}

export const PlaceContextProvider = ({
  children,
}: PlaceContextProviderProps) => {
  const [place, setPlace] = useState<NominatimSuggestion | null>(null);

  return (
    <PlaceContext.Provider value={{ place, setPlace }}>
      {children}
    </PlaceContext.Provider>
  );
};
