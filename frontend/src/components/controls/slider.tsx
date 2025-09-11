import { useAlgorithmContext } from "@/lib/context/context";
import { Slider } from "../ui/slider";

export const SpeedSlider = () => {
  const { cityGraph } = useAlgorithmContext();

  return (
    <div className="space-y-2">
      <h2 className="text-xs text-neutral-100 select-none">Animation Speed</h2>
      <Slider
        defaultValue={[30]}
        min={1}
        step={1}
        max={500}
        onValueChange={(value) => cityGraph.setAlgorithmSpeed(value[0])}
        className="w-30 sm:w-40"
      />
    </div>
  );
};
