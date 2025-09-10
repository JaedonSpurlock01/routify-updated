import {
  useState,
  type ReactNode,
  type Dispatch,
  type SetStateAction,
} from "react";
import { ColorContext } from "./context";

const DEFAULT_MAP_COLOR = 0x83888c;
const DEFAULT_BACKGROUND_COLOR = "#0d0d0d"; // Must be a string for CSS
const DEFAULT_SEARCH_COLOR = 0xe1faf2;
const DEFAULT_PATH_COLOR = 0xff5454;
const DEFAULT_START_DOT_COLOR = 0x42f587;
const DEFAULT_END_DOT_COLOR = 0xfc2d49;

export type ColorContextType = {
  backgroundColor: string;
  setBackgroundColor: Dispatch<SetStateAction<string>>;

  mapColor: number;
  setMapColor: Dispatch<SetStateAction<number>>;

  searchColor: number;
  setSearchColor: Dispatch<SetStateAction<number>>;

  pathColor: number;
  setPathColor: Dispatch<SetStateAction<number>>;

  startDotColor: number;
  setStartDotColor: Dispatch<SetStateAction<number>>;

  endDotColor: number;
  setEndDotColor: Dispatch<SetStateAction<number>>;

  bloomToggle: boolean;
  setBloomToggle: Dispatch<SetStateAction<boolean>>;
};

interface ColorContextProviderProps {
  children: ReactNode;
}

export const ColorContextProvider = ({
  children,
}: ColorContextProviderProps) => {
  const [backgroundColor, setBackgroundColor] = useState<string>(
    DEFAULT_BACKGROUND_COLOR
  );
  const [mapColor, setMapColor] = useState<number>(DEFAULT_MAP_COLOR);
  const [searchColor, setSearchColor] = useState<number>(DEFAULT_SEARCH_COLOR);
  const [pathColor, setPathColor] = useState<number>(DEFAULT_PATH_COLOR);
  const [startDotColor, setStartDotColor] = useState<number>(
    DEFAULT_START_DOT_COLOR
  );
  const [endDotColor, setEndDotColor] = useState<number>(DEFAULT_END_DOT_COLOR);
  const [bloomToggle, setBloomToggle] = useState<boolean>(true);

  const states: ColorContextType = {
    backgroundColor,
    setBackgroundColor,
    mapColor,
    setMapColor,
    searchColor,
    setSearchColor,
    pathColor,
    setPathColor,
    startDotColor,
    setStartDotColor,
    endDotColor,
    setEndDotColor,
    bloomToggle,
    setBloomToggle,
  };

  return (
    <ColorContext.Provider value={states}>{children}</ColorContext.Provider>
  );
};
