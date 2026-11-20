import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { toast } from "sonner";
import { formatMs } from "@/lib/utils";
import { CAPTION } from "./surface";
import { SoundFx } from "@/lib/sound/sound-fx";
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
  const { setBloom, setSound } = useSettings();
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
        case "m":
          setSound((on) => !on);
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
  }, [visualizer, setBloom, setSound, toggleSearch]);
}

/**
 * Plays sounds for what happens on the map: a pop when a point is placed, a
 * bloop when they are cleared, a soft sizzle while a search plays back, and a
 * zap then thunder as a found route strikes in. Silent while sound is off.
 */
export function useSoundEffects() {
  const { visualizer } = useMapSession();
  const { sound } = useSettings();
  const [fx] = useState(() => new SoundFx());

  useEffect(() => () => fx.dispose(), [fx]);

  useEffect(() => {
    fx.setEnabled(sound);
    let previous = visualizer.getState();
    const playing = () => {
      const { status, paused } = visualizer.getState();
      return status === "searching" && !paused;
    };
    fx.setSearching(playing());

    const onChange = () => {
      const state = visualizer.getState();
      if (state.start && !previous.start) fx.place("start");
      else if (state.end && !previous.end) fx.place("end");
      else if (previous.start && !state.start) fx.remove();
      fx.setSearching(playing());
      previous = state;
    };
    const unsubscribe = visualizer.subscribe(onChange);
    const unsubscribeCue = visualizer.subscribeCue((cue) =>
      cue === "strike" ? fx.strike() : fx.thunder()
    );
    return () => {
      unsubscribe();
      unsubscribeCue();
      fx.setSearching(false);
    };
  }, [visualizer, fx, sound]);
}

/** How far the map jolts on the first crack (px), how much it punches in, and how long it shakes (ms). */
const SHAKE_PX = 4;
const SHAKE_ZOOM = 1.025;
const SHAKE_MS = 700;
const SHAKE_FRAME_MS = 35;
/** Jolts lined up with the flash's return strokes (and the thunder's cracks), as [ms, strength]. */
const SHAKE_JOLTS = [
  [0, 1],
  [110, 0.65],
  [240, 0.4],
] as const;

/**
 * Shakes `target` (the map canvas) as each found route's thunder lands:
 * a jolt on every crack, dying away with the rumble. The zoom keeps the
 * canvas covering its frame while it moves. Skipped for reduced motion.
 */
export function useThunderShake(target: RefObject<HTMLElement | null>) {
  const { visualizer } = useMapSession();

  useEffect(() => {
    let shaking: Animation | null = null;
    const unsubscribe = visualizer.subscribeCue((cue) => {
      const element = target.current;
      if (cue !== "thunder" || !element?.animate) return;
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      shaking?.cancel();
      shaking = element.animate(shakeFrames(), { duration: SHAKE_MS, easing: "linear" });
    });
    return () => {
      unsubscribe();
      shaking?.cancel();
    };
  }, [visualizer, target]);
}

function shakeFrames(): Keyframe[] {
  const frames: Keyframe[] = [{ transform: "translate(0px, 0px) scale(1)" }];
  for (let t = SHAKE_FRAME_MS; t < SHAKE_MS; t += SHAKE_FRAME_MS) {
    let strength = 0.25 * Math.exp(-t / 300); // the rumble's tail
    for (const [at, jolt] of SHAKE_JOLTS) if (t >= at) strength += jolt * Math.exp(-(t - at) / 90);
    const px = Math.min(1, strength) * SHAKE_PX;
    const angle = Math.random() * Math.PI * 2;
    const x = (Math.cos(angle) * px).toFixed(2);
    const y = (Math.sin(angle) * px).toFixed(2);
    frames.push({ transform: `translate(${x}px, ${y}px) scale(${SHAKE_ZOOM})` });
  }
  frames.push({ transform: "translate(0px, 0px) scale(1)" });
  return frames;
}

/** A caption over its value, like the toolbar's "Algorithm" and "Speed". */
function resultStat(label: string, value: ReactNode) {
  return (
    <div className="flex flex-col gap-1.5">
      <dt className={CAPTION}>{label}</dt>
      <dd className="leading-none">{value}</dd>
    </div>
  );
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
      <dl className="flex gap-6 tabular-nums">
        {resultStat(
          "Route",
          <>
            {(result.meters / 1000).toFixed(2)} km
            <span className="text-neutral-400"> · {(result.meters / 1609.344).toFixed(2)} mi</span>
          </>
        )}
        {resultStat("Search took", formatMs(result.computeMs))}
      </dl>,
      { duration: 8000 }
    );
  }, [result]);
}
