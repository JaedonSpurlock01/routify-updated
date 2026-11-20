import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Navigate } from "react-router-dom";
import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";

import { ComparisonPanel } from "@/components/map/comparison-panel";
import { Navbar } from "@/components/map/navbar";
import { Scene } from "@/components/map/scene";
import {
  useMapShortcuts,
  useSearchResultToast,
  useSoundEffects,
  useThunderShake,
} from "@/components/map/use-map-controls";
import type { AlgorithmId } from "@/lib/pathfinding/search";
import { Visualizer } from "@/lib/pathfinding/visualizer";
import {
  MapSessionContext,
  useCity,
  useSettings,
  type City,
} from "@/lib/state";

export default function MapPage() {
  const { city } = useCity();
  // Cities live in memory only; a reload or a direct visit starts from search.
  if (!city) return <Navigate to="/" replace />;
  return <MapView key={`${city.place.osmType}/${city.place.osmId}`} city={city} />;
}

function MapView({ city }: { city: City }) {
  const { colors } = useSettings();
  const [visualizer] = useState(() => new Visualizer(city.map, colors));
  const [algorithm, setPrimary] = useState<AlgorithmId>("astar");
  const [compareAlgorithm, setCompareAlgorithm] = useState<AlgorithmId | null>(null);
  // Picking the algorithm already being compared against swaps the two.
  const setAlgorithm = useCallback(
    (next: AlgorithmId) => {
      if (next === compareAlgorithm) setCompareAlgorithm(algorithm);
      setPrimary(next);
    },
    [algorithm, compareAlgorithm]
  );
  const session = useMemo(
    () => ({
      visualizer,
      algorithm,
      setAlgorithm,
      compareAlgorithm,
      setCompareAlgorithm,
    }),
    [visualizer, algorithm, setAlgorithm, compareAlgorithm]
  );

  useEffect(() => () => visualizer.dispose(), [visualizer]);
  /** Wraps just the map canvas, so thunder shakes the map and not the controls. */
  const canvasFrame = useRef<HTMLDivElement>(null);

  // Start far enough back to see the whole city (the camera's vertical FOV is 75°).
  const cameraDistance = useMemo(() => {
    let extent = 0;
    for (const y of city.map.nodeY) extent = Math.max(extent, Math.abs(y));
    for (const x of city.map.nodeX) extent = Math.max(extent, Math.abs(x) * 0.6);
    return THREE.MathUtils.clamp(extent * 1.35, 2, 400);
  }, [city.map]);

  return (
    <MapSessionContext.Provider value={session}>
      <main className="h-svh relative overflow-hidden">
        <div ref={canvasFrame} className="absolute inset-0">
          <Canvas
            frameloop="demand"
            dpr={[1, 2]}
            camera={{
              position: [0, 0, cameraDistance],
              near: 0.01,
              far: cameraDistance * 20,
            }}
            gl={{ antialias: true, powerPreference: "high-performance" }}
          >
            <color attach="background" args={[colors.background]} />
            <Scene />
            <OrbitControls
              enableDamping
              minDistance={0.5}
              maxDistance={cameraDistance * 4}
              mouseButtons={{
                LEFT: THREE.MOUSE.PAN,
                MIDDLE: THREE.MOUSE.DOLLY,
                RIGHT: THREE.MOUSE.ROTATE,
              }}
              touches={{ ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE }}
            />
          </Canvas>
        </div>

        <Navbar />
        <MapEffects canvasFrame={canvasFrame} />
        <ComparisonPanel />

        <div className="pointer-events-none absolute right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] max-w-[70vw] text-right text-neutral-100 [text-shadow:0_1px_8px_rgb(0_0_0/0.8)] sm:max-w-[min(28rem,calc(100vw-24rem))] md:right-6 md:bottom-6 [&_a]:pointer-events-auto">
          <h1 className="text-base text-balance md:text-xl">{city.place.displayName}</h1>
          <p className="mb-2 text-xs text-neutral-300 tabular-nums md:mb-3">
            Lines: {city.map.lineCount.toLocaleString()}
          </p>
          <p className="text-xs font-light text-neutral-300">
            Data ©{" "}
            <a
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noreferrer"
              className="hover:underline"
            >
              OpenStreetMap
            </a>{" "}
            contributors
          </p>
        </div>
      </main>
    </MapSessionContext.Provider>
  );
}

/** Behaviour that needs the map session but renders nothing. */
function MapEffects({ canvasFrame }: { canvasFrame: RefObject<HTMLDivElement | null> }) {
  useMapShortcuts();
  useSearchResultToast();
  useSoundEffects();
  useThunderShake(canvasFrame);
  return null;
}
