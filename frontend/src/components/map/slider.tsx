import { useState } from "react";
import { useMapSession } from "@/lib/state";
import { Slider } from "../ui/slider";

// The slider is logarithmic: each step multiplies the speed by the same
// factor, from MIN to MAX expansions per second. The last step is Instant.
const MIN_SPEED = 300;
const MAX_SPEED = 1_000_000;
const STEPS = 100;
const INSTANT = STEPS;

function speedAt(position: number): number {
  if (position >= INSTANT) return Infinity;
  return MIN_SPEED * (MAX_SPEED / MIN_SPEED) ** (position / (STEPS - 1));
}

function positionOf(speed: number): number {
  if (!Number.isFinite(speed)) return INSTANT;
  const t = Math.log(speed / MIN_SPEED) / Math.log(MAX_SPEED / MIN_SPEED);
  return Math.min(STEPS - 1, Math.max(0, Math.round(t * (STEPS - 1))));
}

function formatSpeed(speed: number): string {
  if (!Number.isFinite(speed)) return "Instant";
  if (speed >= 1e6) return `${(speed / 1e6).toFixed(1).replace(/\.0$/, "")}M/s`;
  if (speed >= 1e3) return `${(speed / 1e3).toFixed(speed >= 1e4 ? 0 : 1).replace(/\.0$/, "")}k/s`;
  return `${Math.round(speed)}/s`;
}

export const SpeedSlider = () => {
  const { visualizer } = useMapSession();
  const [position, setPosition] = useState(() => positionOf(visualizer.speed));
  const speed = speedAt(position);

  return (
    <label className="space-y-2">
      <span className="flex justify-between gap-2 text-xs text-neutral-100 select-none">
        <span>Speed</span>
        <span className="tabular-nums text-neutral-300">{formatSpeed(speed)}</span>
      </span>
      <Slider
        value={[position]}
        min={0}
        step={1}
        max={STEPS}
        aria-label="Playback speed"
        onValueChange={([value]) => {
          setPosition(value);
          visualizer.speed = speedAt(value);
        }}
        className="w-30 sm:w-40"
      />
    </label>
  );
};
