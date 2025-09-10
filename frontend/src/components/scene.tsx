// ThreeJS
import * as THREE from "three";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { KernelSize, Resolution } from "postprocessing";
import { useThree } from "@react-three/fiber";

// React
import { useEffect, useRef, useState } from "react";
import {
  useAlgorithmContext,
  useColorContext,
  useThreeContext,
} from "@/lib/context/context";

// Third-party
import { useEventListener } from "ahooks";
import { useNavigate } from "react-router-dom";
import { lineBaseSegment, SceneObject } from "@/lib/models/scene-object";
import { haversineDistance, worldPointFromScreenPoint } from "@/lib/utils";
import { toast } from "sonner";

const viewport = new THREE.Vector2();

const DEFAULT_OFFSET_DOT_POSITION = 100000;

export const Scene = () => {
  const navigate = useNavigate();

  // State variables to control state of pathfinding
  const { setStartNode, setEndNode, cityGraph, isStopped } =
    useAlgorithmContext();

  // State variables used to control the map
  const { lineMeshRef, topLayerSceneRef, parsedLineData, setLineCount } =
    useThreeContext();

  // Color references
  const { startDotColor, endDotColor, mapColor, bloomToggle, setBloomToggle } =
    useColorContext();

  const [prevColor, setPrevColor] = useState(mapColor);

  if (!parsedLineData.length) navigate("/");

  const [dotCount, setDotCount] = useState(0);
  const [sceneLoaded, setSceneLoaded] = useState(false);
  const [isCursorInScene, setIsCursorInScene] = useState(true);
  const [isClickProcessing, setIsClickProcessing] = useState(false);

  // Camera reference used to find cursor position
  const { camera } = useThree();

  // Dot references to directly change their position
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const startDotRef = useRef<any>(null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const endDotRef = useRef<any>(null);

  if (!topLayerSceneRef.current) {
    topLayerSceneRef.current = new SceneObject(0x83888c, 0.01);

    // Add each node to the graph and scene
    parsedLineData.forEach((element) => {
      if (element.type == "node") {
        topLayerSceneRef.current?.addNode({
          id: element.id.toString(),
          lat: element.lat,
          lon: element.lon,
        });
        cityGraph.addVertex(element.id.toString(), element.lat, element.lon);
      }
    });

    topLayerSceneRef.current.calculateMapCenter();

    // Create line properties for each way
    parsedLineData.forEach((element) => {
      if (element.type == "way") {
        for (let i = 0; i < element.ids.length - 1; i++) {
          const startID = element.ids[i].toString();
          const endID = element.ids[i + 1].toString();

          const startNodeCoords = topLayerSceneRef.current?.getNode(startID);
          const endNodeCoords = topLayerSceneRef.current?.getNode(endID);

          if (!startNodeCoords || !endNodeCoords) return;

          const distance = haversineDistance(
            ...startNodeCoords.unprojected,
            ...endNodeCoords.unprojected
          );

          cityGraph.addEdge(startID, endID, distance * 1000);

          topLayerSceneRef.current?.createLineProperty(
            ...startNodeCoords.projected,
            ...endNodeCoords.projected,
            startID,
            endID
          );
        }
      }
    });
    setSceneLoaded(true);
    setLineCount(topLayerSceneRef.current.getLineCount());
  }

  useEffect(() => {
    if (!sceneLoaded || !topLayerSceneRef.current) return;
    topLayerSceneRef.current.updateScene(lineMeshRef);
    return () => {
      // Your entire pc will basically crash if you remove these two lines
      // When hot-reloading or reloading, the line properties get lost, causing
      // Large white squares overlapping each other 1M+ times, causing major
      // z fighting problems
      topLayerSceneRef.current = null;
      setSceneLoaded(false);
    };
  }, [sceneLoaded, topLayerSceneRef, lineMeshRef]);

  // "Add" the dot to the scene (moving it from out-of-bounds)
  const addDot = async (coordinates: THREE.Vector3) => {
    if (isClickProcessing) return;
    setIsClickProcessing(true);

    if (dotCount == 2) {
      setIsClickProcessing(false);
      return;
    }

    // Get the closest graph node based on coordinates
    const closestNode = topLayerSceneRef.current?.findNearestNode(
      coordinates.x,
      coordinates.y
    );

    // If the user is placing a start dot
    if (!dotCount && closestNode && startDotRef.current) {
      setStartNode(closestNode.id);
      startDotRef.current.x = closestNode.x;
      startDotRef.current.y = closestNode.y;
      startDotRef.current.z = 0;
      setDotCount(1);

      toast.success(
        <span>
          <b>Added start</b>
        </span>,
        {
          style: {
            background: "#262626",
            color: "#fff",
          },
        }
      );

      // If the user is placing an end dot
    } else if (dotCount === 1 && closestNode) {
      setEndNode(closestNode.id);
      endDotRef.current.x = closestNode.x;
      endDotRef.current.y = closestNode.y;
      endDotRef.current.z = 0;
      setDotCount(2);

      toast.success(
        <span>
          <b>Added goal</b>
        </span>,
        {
          style: {
            background: "#262626",
            color: "#fff",
          },
        }
      );
    }

    setIsClickProcessing(false);
  };

  // Click handling that first finds the position of the cursor,
  // then "adds" the dot to the map (actually it just moves it from far away)
  // Note: mounting and unmounting dots is not recommended by ThreeJS docs
  const handleClick = (event: MouseEvent) => {
    if (!event || !isCursorInScene) return;

    viewport.x = (event.clientX / window.innerWidth) * 2 - 1; // Find X NDC coordinate (-1 to 1)
    viewport.y = -((event.clientY / window.innerHeight) * 2) + 1; // Find Y NDC coordinate (-1 to 1)

    const canvasMousePos = worldPointFromScreenPoint(viewport, camera); // Find the position relative to ThreeJS scene

    addDot(canvasMousePos);
  };
  useEventListener("dblclick", handleClick);

  // Register mouse enter and leave events
  useEffect(() => {
    const canvas = document.querySelector("canvas");
    if (canvas) {
      canvas.addEventListener("mouseenter", () => setIsCursorInScene(true));
      canvas.addEventListener("mouseleave", () => setIsCursorInScene(false));
      return () => {
        canvas.removeEventListener("mouseenter", () =>
          setIsCursorInScene(true)
        );
        canvas.removeEventListener("mouseleave", () =>
          setIsCursorInScene(false)
        );
      };
    }
  }, []);

  // This event listener controls keyboard events
  useEventListener("keypress", (e) => {
    if (e.key === "c") {
      // Resets the map
      toast.success("Map Resetted", {
        style: {
          background: "#262626",
          color: "#fff",
        },
        duration: 5000,
      });
      topLayerSceneRef.current?.updateScene(lineMeshRef);
      setDotCount(0);
      startDotRef.current.x = DEFAULT_OFFSET_DOT_POSITION;
      endDotRef.current.x = DEFAULT_OFFSET_DOT_POSITION;
      setStartNode(null);
      setEndNode(null);
    } else if (e.key === "b") {
      // Toggle the bloom
      setBloomToggle(!bloomToggle);
    } else if (e.key === "d") {
      toast.success("Cleared points", {
        style: {
          background: "#262626",
          color: "#fff",
        },
        duration: 5000,
      });
      setDotCount(0);
      startDotRef.current.x = DEFAULT_OFFSET_DOT_POSITION;
      endDotRef.current.x = DEFAULT_OFFSET_DOT_POSITION;
      setStartNode(null);
      setEndNode(null);
    }
  });

  // This useEffect controls the complete refresh of the page when reloading (Fixes memory leak issues *Stupid react*)
  // useEffect(() => {
  //   const handleBeforeUnload = () => {
  //     window.location.reload();
  //   };

  //   window.addEventListener("beforeunload", handleBeforeUnload);

  //   return () => {
  //     window.removeEventListener("beforeunload", handleBeforeUnload);
  //   };
  // }, []);

  // This useEffect controls the reset of the dots
  useEffect(() => {
    if (isStopped && startDotRef.current && endDotRef.current) {
      setDotCount(0);
      startDotRef.current.x = DEFAULT_OFFSET_DOT_POSITION;
      endDotRef.current.x = DEFAULT_OFFSET_DOT_POSITION;
      setStartNode(null);
      setEndNode(null);
    }
  }, [isStopped, setStartNode, setEndNode]);

  // This useEffect controls the color of the map
  useEffect(() => {
    if (prevColor === mapColor) return; // Avoid unnecessary map updates
    topLayerSceneRef.current?.changeColor(mapColor);
    topLayerSceneRef.current?.updateScene(lineMeshRef);
    setPrevColor(mapColor);
  }, [mapColor, prevColor, lineMeshRef, topLayerSceneRef]);

  // The ThreeJS canvas consists of four major assets:
  //  - The base layer: the main map layer
  //  - The pathfinding layer: an invisible copy of the base layer
  //  - The green dot controlled by the user
  //  - The red dot controlled by the user
  return (
    <>
      {/* The fun glow! */}
      {bloomToggle && (
        <EffectComposer>
          <Bloom
            intensity={0.5} // The bloom intensity
            kernelSize={KernelSize.VERY_SMALL} // blur kernel size
            luminanceThreshold={0.25} // luminance threshold. Raise this value to mask out darker elements in the scene
            luminanceSmoothing={0.025} // smoothness of the luminance threshold. Range is [0, 1]
            mipmapBlur={true} // Enables or disables mipmap blur
            resolutionX={Resolution.AUTO_SIZE} // The horizontal resolution
            resolutionY={Resolution.AUTO_SIZE} // The vertical resolution
          />
        </EffectComposer>
      )}

      <ambientLight intensity={10} />

      {/* The map layer */}
      <instancedMesh
        ref={lineMeshRef}
        args={[undefined, undefined, topLayerSceneRef.current.getLineCount()]}
      >
        <shapeGeometry args={[lineBaseSegment]} />
        <meshBasicMaterial
          attach="material"
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </instancedMesh>

      {/* Green dot on map */}
      <mesh
        ref={startDotRef}
        position={[
          startDotRef.current
            ? startDotRef.current.x
            : DEFAULT_OFFSET_DOT_POSITION,
          startDotRef.current
            ? startDotRef.current.y
            : DEFAULT_OFFSET_DOT_POSITION,
          0,
        ]}
      >
        <sphereGeometry args={[0.06, 32, 32]} />
        <meshStandardMaterial color={startDotColor} />
      </mesh>

      {/* Red dot on map */}
      <mesh
        ref={endDotRef}
        position={[
          endDotRef.current ? endDotRef.current.x : DEFAULT_OFFSET_DOT_POSITION,
          endDotRef.current ? endDotRef.current.y : DEFAULT_OFFSET_DOT_POSITION,
          0,
        ]}
      >
        <sphereGeometry args={[0.06, 32, 32]} />
        <meshStandardMaterial color={endDotColor} />
      </mesh>
    </>
  );
};
