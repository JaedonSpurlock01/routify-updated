import { useEffect } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { KernelSize } from "postprocessing";
import { toast } from "sonner";
import { useMapSession, useSettings, useVisualizerState } from "@/lib/state";

const ndc = new THREE.Vector3();

/** Where a pointer position on the canvas hits the map plane (z = 0). */
function mapPointAt(event: MouseEvent, canvas: HTMLElement, camera: THREE.Camera) {
  const rect = canvas.getBoundingClientRect();
  ndc.set(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1,
    0.5
  );
  const direction = ndc.unproject(camera).sub(camera.position).normalize();
  const distance = -camera.position.z / direction.z;
  return camera.position.clone().addScaledVector(direction, distance);
}

export function Scene() {
  const { visualizer } = useMapSession();
  const { start, end } = useVisualizerState();
  const { colors, bloom } = useSettings();
  const { camera, gl, invalidate } = useThree();

  // The canvas only renders on demand; the visualizer says when it has drawn.
  useEffect(() => {
    visualizer.onInvalidate = invalidate;
    return () => {
      visualizer.onInvalidate = null;
    };
  }, [visualizer, invalidate]);

  useEffect(() => {
    visualizer.setColors(colors);
  }, [visualizer, colors]);

  useEffect(() => {
    const canvas = gl.domElement;
    const onDoubleClick = (event: MouseEvent) => {
      const point = mapPointAt(event, canvas, camera);
      const placed = visualizer.placePoint(point.x, point.y);
      if (placed === "start") toast.success("Start placed");
      else if (placed === "end") toast.success("Goal placed");
      else if (visualizer.getState().status === "idle") {
        toast("Both points are placed. Press D to clear them.");
      }
    };
    canvas.addEventListener("dblclick", onDoubleClick);
    return () => canvas.removeEventListener("dblclick", onDoubleClick);
  }, [visualizer, camera, gl]);

  return (
    <>
      {bloom && (
        <EffectComposer>
          <Bloom
            intensity={0.5}
            kernelSize={KernelSize.VERY_SMALL}
            luminanceThreshold={0.25}
            luminanceSmoothing={0.025}
            mipmapBlur
          />
        </EffectComposer>
      )}

      <primitive object={visualizer.object} />

      {start && (
        <mesh position={[start.x, start.y, 0.02]}>
          <circleGeometry args={[0.06, 32]} />
          <meshBasicMaterial color={colors.start} toneMapped={false} />
        </mesh>
      )}
      {end && (
        <mesh position={[end.x, end.y, 0.02]}>
          <circleGeometry args={[0.06, 32]} />
          <meshBasicMaterial color={colors.end} toneMapped={false} />
        </mesh>
      )}
    </>
  );
}
