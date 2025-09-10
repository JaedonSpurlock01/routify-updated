import { createContext, useContext } from "react";
import type { AlgorithmContextValue } from "./algorithm.context";
import type { ColorContextType } from "./color.context";
import type { PlaceContextValue } from "./place.context";
import type { ThreeContextType } from "./three.context";

export const AlgorithmContext = createContext<
  AlgorithmContextValue | undefined
>(undefined);

export const ColorContext = createContext<ColorContextType | undefined>(
  undefined
);

export const PlaceContext = createContext<PlaceContextValue | undefined>(
  undefined
);

export const ThreeContext = createContext<ThreeContextType | undefined>(
  undefined
);

export function usePlaceContext() {
  const context = useContext(PlaceContext);
  if (context === undefined) {
    throw new Error(
      "usePlaceContext must be used within a PlaceContextProvider"
    );
  }
  return context;
}

export function useThreeContext() {
  const context = useContext(ThreeContext);
  if (context === undefined) {
    throw new Error(
      "useThreeContext must be used within a ThreeContextProvider"
    );
  }
  return context;
}

export function useAlgorithmContext() {
  const context = useContext(AlgorithmContext);
  if (context === undefined) {
    throw new Error(
      "useAlgorithmContext must be used within a AlgorithmContextProvider"
    );
  }
  return context;
}

export function useColorContext() {
  const context = useContext(ColorContext);
  if (context === undefined) {
    throw new Error(
      "useColorContext must be used within a ColorContextProvider"
    );
  }
  return context;
}
