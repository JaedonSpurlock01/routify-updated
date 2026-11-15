import { useMapSession } from "@/lib/state";
import { Slider } from "../ui/slider";

export const SpeedSlider = () => {
  const { visualizer } = useMapSession();

  return (
    <label className="space-y-2">
      <span className="block text-xs text-neutral-100 select-none">
        Animation Speed
      </span>
      <Slider
        defaultValue={[visualizer.speed]}
        min={1}
        step={1}
        max={500}
        aria-label="Animation speed"
        onValueChange={([value]) => {
          visualizer.speed = value;
        }}
        className="w-30 sm:w-40"
      />
    </label>
  );
};
