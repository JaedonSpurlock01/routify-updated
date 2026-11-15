import type { CSSProperties, ReactNode } from "react";

const RAY_COUNT = 15;

const rays = Array.from({ length: RAY_COUNT }, (_, index) => {
  const progress = index / (RAY_COUNT - 1);
  const variation = (index * 0.618) % 1;
  return {
    "--ray-left": `${2 + progress * 96}%`,
    "--ray-rotation": `${28 - progress * 56}deg`,
    "--ray-sway": index % 2 === 0 ? "1deg" : "0.5deg",
    "--ray-width": `${40 + variation * 25}px`,
    "--ray-blur": `${24 + variation * 9}px`,
    "--ray-pulse-duration": `${6 + variation * 5}s`,
    "--ray-sway-duration": `${12 + variation * 9}s`,
    "--ray-delay": `${-variation * 10}s`,
  } as CSSProperties;
});

/** Home page backdrop: soft light rays fanning down from the top edge. */
export function LightRays({ children }: { children: ReactNode }) {
  return (
    <div className="relative overflow-hidden bg-[radial-gradient(ellipse_at_50%_-20%,#2e3440,transparent_70%)]">
      <div aria-hidden className="absolute inset-0 overflow-hidden pointer-events-none">
        {rays.map((style, index) => (
          <div key={index} className="light-ray" style={style} />
        ))}
      </div>
      <div className="relative z-10">{children}</div>
    </div>
  );
}
