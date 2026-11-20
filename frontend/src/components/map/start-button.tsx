import { Play, Square } from "lucide-react";
import { useVisualizerState } from "@/lib/state";
import { cn } from "@/lib/utils";
import { Button } from "../ui/button";
import { useToggleSearch } from "./use-map-controls";

const ICON =
  "absolute transition-[opacity,scale,filter] duration-200 ease-out data-[hidden=true]:opacity-0 data-[hidden=true]:scale-50 data-[hidden=true]:blur-[2px]";

export const StartButton = () => {
  const { status } = useVisualizerState();
  const toggleSearch = useToggleSearch();
  const running = status !== "idle";

  return (
    <Button
      onClick={toggleSearch}
      size="icon"
      aria-label={running ? "Stop search" : "Start search"}
      className={cn(
        "relative shrink-0 rounded-full size-11 text-white shadow-none",
        running
          ? "bg-[#ff4252] hover:bg-[#ff5463]"
          : "bg-[#46b780] hover:bg-[#4dcc8e]"
      )}
    >
      <Play fill="currentColor" className={ICON} data-hidden={running} />
      <Square fill="currentColor" className={ICON} data-hidden={!running} />
    </Button>
  );
};
