import {
  useState,
  useRef,
  type ReactNode,
  type Dispatch,
  type SetStateAction,
  type RefObject,
} from "react";
import * as THREE from "three";
import { ThreeContext } from "./context";
import type { OverpassElement } from "@/api/osm";
import { SceneObject } from "../models/scene-object";

export type ThreeContextType = {
  /** Ref to the top-layer THREE.Scene */
  topLayerSceneRef: RefObject<SceneObject | null>;
  /** Ref to the instanced mesh for lines */
  lineMeshRef: RefObject<THREE.InstancedMesh | null>;
  parsedLineData: OverpassElement[];
  setParsedLineData: Dispatch<SetStateAction<OverpassElement[]>>;
  /** Total number of lines in the scene */
  lineCount: number;
  setLineCount: Dispatch<SetStateAction<number>>;
};

interface ThreeContextProviderProps {
  children: ReactNode;
}

export const ThreeContextProvider = ({
  children,
}: ThreeContextProviderProps) => {
  const topLayerSceneRef = useRef<SceneObject>(null);
  const lineMeshRef = useRef<THREE.InstancedMesh | null>(null);

  const [parsedLineData, setParsedLineData] = useState<OverpassElement[]>([]);
  const [lineCount, setLineCount] = useState<number>(0);

  const states: ThreeContextType = {
    lineMeshRef,
    topLayerSceneRef,
    parsedLineData,
    setParsedLineData,
    lineCount,
    setLineCount,
  };

  return (
    <ThreeContext.Provider value={states}>{children}</ThreeContext.Provider>
  );
};
