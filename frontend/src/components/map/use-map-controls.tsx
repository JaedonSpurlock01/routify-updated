import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { formatMs } from "@/lib/utils";
import { useMapSession, useSettings, useVisualizerState } from "@/lib/state";

/** Starts a search if one can start, explains why not, or stops the current one. */
export function useToggleSearch() {
  const { visualizer, algorithm, compareAlgorithm } = useMapSession();
  return useCallback(() => {
    const { status, start, end } = visualizer.getState();
    if (status !== "idle") visualizer.stop();
    else if (!start) toast("Double click the map to choose a starting point");
    else if (!end) toast("Double click the map to choose a goal");
    else visualizer.start(algorithm, compareAlgorithm);
  }, [visualizer, algorithm, compareAlgorithm]);
}

/** Pauses or resumes playback; once it has finished, plays it again from the start. */
export function useTogglePlayback() {
  const { visualizer } = useMapSession();
  return useCallback(() => {
    const { status, paused } = visualizer.getState();
    if (status === "idle") return;
    if (status === "done") {
      visualizer.seek(0);
      visualizer.resume();
    } else if (paused) visualizer.resume();
    else visualizer.pause();
  }, [visualizer]);
}

/** Keyboard shortcuts for the map page. */
export function useMapShortcuts() {
  const { visualizer } = useMapSession();
  const { setBloom } = useSettings();
  const toggleSearch = useToggleSearch();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
      // Already handled, e.g. Escape closing a menu or the settings sheet.
      if (event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable]")) return;
      const { status, paused } = visualizer.getState();

      switch (event.key.toLowerCase()) {
        case " ":
          // Let Space keep activating whichever button has focus.
          if (target?.closest("button, a, [role='menuitem'], [role='slider'], [role='switch']")) return;
          event.preventDefault();
          // Start, then pause and resume; a finished search is erased as before.
          if (status === "idle" || status === "done") toggleSearch();
          else if (paused) visualizer.resume();
          else visualizer.pause();
          break;
        case "escape":
          if (status !== "idle") visualizer.stop();
          break;
        case "b":
          setBloom((on) => !on);
          break;
        case "c":
          visualizer.clearPoints();
          toast.success("Map reset");
          break;
        case "d":
          visualizer.clearPoints();
          toast.success("Points cleared");
          break;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [visualizer, setBloom, toggleSearch]);
}

/** Announces how a search ended, once per search however often it is scrubbed past its end. */
export function useSearchResultToast() {
  const { result } = useVisualizerState();
  const announced = useRef(result);

  useEffect(() => {
    if (!result || result === announced.current) return;
    announced.current = result;

    if (!result.found) {
      toast.error("No path found");
      return;
    }
    toast.success(
      <span className="tabular-nums">
        Distance:{" "}
        <span className="text-green-400">
          {(result.meters / 1000).toFixed(2)}
        </span>{" "}
        km · <span className="text-green-400">{(result.meters / 1609.344).toFixed(2)}</span>{" "}
        mi
        <br />
        Search took <span className="text-blue-400">{formatMs(result.computeMs)}</span>
      </span>,
      { duration: 8000 }
    );
  }, [result]);
}
