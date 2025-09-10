import { useMemo, useState, type ReactNode } from "react";
import { Graph } from "../models/graph";
import type { AlgorithmName } from "../models/pathfinding-instance";
import { AlgorithmContext } from "./context";

export interface AlgorithmContextValue {
  isAlgorithmReady: boolean;
  setIsAlgorithmReady: React.Dispatch<React.SetStateAction<boolean>>;
  startNode: string | null;
  setStartNode: React.Dispatch<React.SetStateAction<string | null>>;
  endNode: string | null;
  setEndNode: React.Dispatch<React.SetStateAction<string | null>>;
  cityGraph: Graph;
  setIsStopped: React.Dispatch<React.SetStateAction<boolean>>;
  isStopped: boolean;
  boundingBox: [string, string, string, string];
  setBoundingBox: React.Dispatch<
    React.SetStateAction<[string, string, string, string]>
  >;
  selectedAlgorithm: AlgorithmName;
  setSelectedAlgorithm: React.Dispatch<React.SetStateAction<AlgorithmName>>;
}

interface AlgorithmContextProviderProps {
  children: ReactNode;
}

export const AlgorithmContextProvider = ({
  children,
}: AlgorithmContextProviderProps) => {
  const [isAlgorithmReady, setIsAlgorithmReady] = useState(false);
  const [isStopped, setIsStopped] = useState(true);
  const [startNode, setStartNode] = useState<string | null>(null);
  const [endNode, setEndNode] = useState<string | null>(null);
  const [boundingBox, setBoundingBox] = useState<
    [string, string, string, string]
  >(["", "", "", ""]);

  const [selectedAlgorithm, setSelectedAlgorithm] =
    useState<AlgorithmName>("A* Search");

  const cityGraph = useMemo(() => new Graph(), []);

  const states = {
    isAlgorithmReady,
    setIsAlgorithmReady,
    startNode,
    setStartNode,
    endNode,
    setEndNode,
    cityGraph,
    setIsStopped,
    isStopped,
    boundingBox,
    setBoundingBox,
    selectedAlgorithm,
    setSelectedAlgorithm,
  };

  return (
    <AlgorithmContext.Provider value={states}>
      {children}
    </AlgorithmContext.Provider>
  );
};
