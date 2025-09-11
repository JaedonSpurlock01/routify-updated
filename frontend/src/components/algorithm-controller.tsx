import { useEffect, useMemo, useState, useRef } from "react";

import {
  useAlgorithmContext,
  useColorContext,
  useThreeContext,
} from "@/lib/context/context";
import { toast } from "sonner";
import PathfindingInstance from "@/lib/models/pathfinding-instance";

// @ts-expect-error Dumb
let g_line_array = [];
let time_spent: number = 0;

export const AlgorithmController = () => {
  const {
    cityGraph,
    isAlgorithmReady,
    startNode,
    endNode,
    isStopped,
    selectedAlgorithm,
  } = useAlgorithmContext();
  const { lineMeshRef, topLayerSceneRef } = useThreeContext();
  const { pathColor, searchColor, mapColor } = useColorContext();
  const [started, setStarted] = useState(false);
  const [finished, setFinished] = useState(false);
  const [updatedLines, setUpdatedLines] = useState([]);

  // Inside your component
  const isStoppedRef = useRef(false);

  useEffect(() => {
    isStoppedRef.current = isStopped; // React is so dumb -_-
  }, [isStopped]);

  const pathfindingInstance = useMemo(() => {
    const instance = new PathfindingInstance();
    // @ts-expect-error Dumb
    instance.setStartNode(cityGraph.getVertex(startNode));
    // @ts-expect-error Dumb
    instance.setEndNode(cityGraph.getVertex(endNode));
    instance.setGraph(cityGraph);
    return instance;
  }, [startNode, endNode, cityGraph]);

  // This useEffect clears the new lines when the stop button is pressed
  useEffect(() => {
    if (!isStopped) return;
    updatedLines.forEach((line) => {
      topLayerSceneRef.current?.updateLineOnScene({
        startID: line[0],
        endID: line[1],
        colorHex: mapColor,
        lineWidth: 0.01,
        // @ts-expect-error Dumb
        mesh: lineMeshRef.current,
      });
    });
    g_line_array = [];
    setUpdatedLines([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStopped, mapColor, lineMeshRef, topLayerSceneRef]);

  //   // This useEffect controls the "Path" found
  useEffect(() => {
    if (finished && !isStopped && started) {
      let currentID = endNode;
      const predecessors = pathfindingInstance.getPredecessors();

      if (!predecessors || !currentID) return;

      const existingPath = predecessors.get(currentID);
      const finalDistance = pathfindingInstance.getFinalDistance();

      if (existingPath) {
        toast.success(
          <span>
            {finalDistance && finalDistance !== -1 && (
              <>
                Distance:{" "}
                <span className="text-green-500">
                  {(finalDistance / 1000).toFixed(2)}{" "}
                  <span className="text-white">km</span>
                  <span className="text-white"> | </span>
                  {(finalDistance / 1609).toFixed(2)}{" "}
                  <span className="text-white">mi</span>
                </span>
                <br />
              </>
            )}
            Time:{" "}
            <span className="text-blue-500">
              {(time_spent / 1000).toFixed(2)}
            </span>{" "}
            seconds
          </span>,
          {
            style: {
              background: "#262626",
              color: "#fff",
              borderRadius: "50px",
              borderColor: "#404040",
            },
            duration: 8000,
          }
        );
      } else {
        toast.error("No path found", {
          style: {
            background: "#262626",
            color: "#fff",
            borderRadius: "50px",
            borderColor: "#404040",
          },
          duration: 5000,
        });
      }

      const delay = async (ms: number) => {
        return new Promise((resolve) => setTimeout(resolve, ms));
      };

      const processNode = async () => {
        while (
          predecessors &&
          currentID &&
          predecessors.get(currentID) &&
          !isStoppedRef.current
        ) {
          const cameFromID = predecessors.get(currentID);

          if (cameFromID) {
            topLayerSceneRef.current?.updateLineOnScene({
              startID: cameFromID,
              endID: currentID,
              colorHex: pathColor,
              lineWidth: 0.05,
              // @ts-expect-error Dumb
              mesh: lineMeshRef.current,
              z: 0.008,
            });
          }

          // Add the updated line so it can be reset later
          g_line_array.push([cameFromID, currentID]);

          // @ts-expect-error Dumb
          currentID = cameFromID;
          await delay(3);
        }
      };

      processNode();
      setFinished(false);
    }
  }, [
    endNode,
    finished,
    isStopped,
    lineMeshRef,
    pathColor,
    pathfindingInstance,
    topLayerSceneRef,
    started,
  ]);

  // This useEffect controls the pathfinding
  useEffect(() => {
    if (isStopped) {
      setStarted(false);
      // @ts-expect-error Dumb
      setUpdatedLines(g_line_array);
      pathfindingInstance.reset();
      return;
    }

    if (!isAlgorithmReady || started) return;

    let startTime: number;

    if (isAlgorithmReady && !started) {
      pathfindingInstance.start(selectedAlgorithm);
      startTime = performance.now();
      setStarted(true);
    }

    const processSteps = () => {
      for (let i = 0; i < cityGraph.getAlgorithmSpeed(); i++) {
        if (pathfindingInstance.isFinished()) {
          setFinished(true);
          time_spent = performance.now() - startTime;
          return;
        }

        // Process the next step
        const ways = pathfindingInstance.nextStep();

        if (ways) {
          for (const way of ways) {
            if (way && way.length == 2) {
              topLayerSceneRef.current?.updateLineOnScene({
                startID: way[0],
                endID: way[1],
                colorHex: searchColor,
                lineWidth: 0.025,
                // @ts-expect-error Dumb
                mesh: lineMeshRef.current,
                z: 0.001,
              });

              // Add the updated line so it can be reset later
              g_line_array.push([way[0], way[1]]);
            }
          }
        }
      }

      // @ts-expect-error Ignore this
      setUpdatedLines(g_line_array);
      requestAnimationFrame(processSteps);
    };
    // Initial call to start pathfinding
    requestAnimationFrame(processSteps);
  }, [
    cityGraph,
    isAlgorithmReady,
    isStopped,
    lineMeshRef,
    pathfindingInstance,
    searchColor,
    started,
    topLayerSceneRef,
    selectedAlgorithm,
  ]);

  return null;
};
