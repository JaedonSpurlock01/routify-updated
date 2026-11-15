import { useRef, type ReactNode } from "react";
import { Pause, Play, RotateCcw, SkipForward } from "lucide-react";
import { useMapSession, usePlaybackProgress, useVisualizerState } from "@/lib/state";
import { Button } from "../ui/button";
import { Slider } from "../ui/slider";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { useTogglePlayback } from "./use-map-controls";

const BAR_BUTTON =
  "size-8 shrink-0 rounded-full text-neutral-100 hover:bg-neutral-700 hover:text-white disabled:opacity-40";

function BarButton({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Pause, the search timeline and skip-to-end, shown while a search is on
 * screen. Dragging the timeline holds playback and picks it back up on release.
 */
export function PlaybackBar() {
  const { status } = useVisualizerState();
  if (status === "idle") return null;
  return <Bar />;
}

function Bar() {
  const { visualizer } = useMapSession();
  const { status, paused } = useVisualizerState();
  const progress = usePlaybackProgress();
  const togglePlayback = useTogglePlayback();
  /** Whether a drag on the timeline paused playback, so release should resume it. */
  const resumeOnRelease = useRef(false);

  // On pointer up rather than onValueCommit, which skips presses that don't move the thumb.
  const release = () => {
    if (!resumeOnRelease.current) return;
    resumeOnRelease.current = false;
    visualizer.resume();
  };

  const done = status === "done";
  const toggleLabel = done ? "Replay" : paused ? "Resume" : "Pause";
  const cursor = progress?.cursor ?? 0;
  const length = progress?.length ?? 0;

  return (
    <div
      role="group"
      aria-label="Playback"
      className="pointer-events-auto flex items-center gap-2 rounded-full border border-border bg-neutral-900/85 px-1.5 py-1 text-neutral-100 shadow-lg backdrop-blur-md animate-rise-in"
    >
      <BarButton label={toggleLabel}>
        <Button
          size="icon"
          variant="ghost"
          aria-label={toggleLabel}
          className={BAR_BUTTON}
          onClick={togglePlayback}
        >
          {done ? (
            <RotateCcw />
          ) : paused ? (
            <Play fill="currentColor" />
          ) : (
            <Pause fill="currentColor" />
          )}
        </Button>
      </BarButton>

      <Slider
        value={[cursor]}
        min={0}
        max={Math.max(length, 1)}
        step={1}
        aria-label="Search timeline"
        className="w-44 sm:w-72"
        onPointerDown={() => {
          const { status, paused } = visualizer.getState();
          if (status !== "done" && !paused && visualizer.pause()) resumeOnRelease.current = true;
        }}
        onValueChange={([value]) => visualizer.seek(value)}
        onPointerUp={release}
        onPointerCancel={release}
      />

      <span className="hidden min-w-28 text-right text-[11px] tabular-nums text-neutral-300 sm:block">
        {cursor.toLocaleString()} / {length.toLocaleString()}
      </span>

      <BarButton label="Skip to end">
        <Button
          size="icon"
          variant="ghost"
          aria-label="Skip to end"
          className={BAR_BUTTON}
          disabled={done}
          onClick={() => visualizer.skipToEnd()}
        >
          <SkipForward fill="currentColor" />
        </Button>
      </BarButton>
    </div>
  );
}
