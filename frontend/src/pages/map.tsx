import { AlgorithmController } from "@/components/algorithm-controller";
import { Navbar } from "@/components/controls/navbar";
import { Scene } from "@/components/scene";
import {
  useColorContext,
  usePlaceContext,
  useThreeContext,
} from "@/lib/context/context";
import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";

import * as THREE from "three";

export default function MapPage() {
  const { place } = usePlaceContext();
  const { backgroundColor } = useColorContext();
  const { lineCount } = useThreeContext();

  return (
    <main className="w-screen h-screen relative overflow-hidden">
      <Canvas
        camera={{
          position: [0, 0, 10],
          near: 0.001,
          far: 1000,
        }}
      >
        <color attach="background" args={[backgroundColor]} />
        <Scene />
        <OrbitControls
          enableDamping={true}
          enableRotate={false}
          enablePan={true}
          mouseButtons={{
            LEFT: THREE.MOUSE.PAN,
            MIDDLE: THREE.MOUSE.DOLLY,
            RIGHT: THREE.MOUSE.ROTATE,
          }}
        />
      </Canvas>

      <Navbar />

      <AlgorithmController />

      <div className="absolute bottom-6 right-6 text-neutral-100 flex-col flex text-right">
        <h1 className="text-xl">{place?.display_name}</h1>
        <p className="text-xs mb-3">Lines: {lineCount.toLocaleString()}</p>
        <a
          href="https://www.openstreetmap.org/about/"
          target="_blank"
          className="hover:underline"
        >
          <p className="text-xs font-light">Data @ OpenStreetMap</p>
        </a>
        <p className="text-xs font-light">
          Powered by{" "}
          <a
            href="https://www.geoapify.com/"
            className="hover:underline"
            target="_blank"
          >
            Geoapify
          </a>
        </p>
      </div>
    </main>
  );
}
