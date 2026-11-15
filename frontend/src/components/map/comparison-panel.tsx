import { useState } from "react";
import { Check, X } from "lucide-react";
import { algorithmInfo } from "@/lib/pathfinding/search";
import type { Comparison, RunStats } from "@/lib/pathfinding/visualizer";
import { useSettings, useVisualizerState } from "@/lib/state";
import { cn } from "@/lib/utils";

interface Metric {
  label: string;
  /** Null when there is nothing to show yet (or ever, e.g. no route). */
  value: (run: RunStats) => number | null;
  format: (value: number) => string;
}

const METRICS: Metric[] = [
  {
    label: "Route length",
    value: (run) => (run.found ? run.meters : null),
    format: (m) => `${(m / 1000).toFixed(2)} km`,
  },
  {
    label: "Nodes expanded",
    value: (run) => run.nodesExpanded,
    format: (n) => n.toLocaleString(),
  },
  {
    label: "Roads explored",
    value: (run) => run.linesExplored,
    format: (n) => n.toLocaleString(),
  },
  {
    label: "Search time",
    value: (run) => run.seconds,
    format: (s) => `${s.toFixed(2)} s`,
  },
];

/** Live side-by-side stats for a two-algorithm run. Lower is better everywhere. */
export function ComparisonPanel() {
  const { comparison, status } = useVisualizerState();
  const [dismissedId, setDismissedId] = useState<number | null>(null);
  if (!comparison || comparison.id === dismissedId) return null;

  return (
    <ComparisonCard
      key={comparison.id}
      comparison={comparison}
      running={status === "searching" || status === "tracing"}
      onClose={() => setDismissedId(comparison.id)}
    />
  );
}

function ComparisonCard({
  comparison,
  running,
  onClose,
}: {
  comparison: Comparison;
  running: boolean;
  onClose: () => void;
}) {
  const { colors } = useSettings();
  const { runs, sharedLines } = comparison;
  const sideColors = [colors.compareA, colors.compareB];
  const union = runs[0].linesExplored + runs[1].linesExplored - sharedLines;
  const overlap = union > 0 ? sharedLines / union : 0;
  const verdict = running ? null : summarize(runs);

  return (
    <section
      aria-label="Algorithm comparison"
      className="absolute z-10 inset-x-4 bottom-4 sm:inset-x-auto sm:left-6 sm:bottom-6 sm:w-80 rounded-2xl border border-neutral-700 bg-neutral-900/90 p-4 text-neutral-100 shadow-xl backdrop-blur-md animate-rise-in"
    >
      <header className="flex items-center gap-2">
        <h2 className="text-sm font-medium">Comparison</h2>
        <span
          className={cn(
            "text-[10px] rounded-full px-2 py-0.5 border",
            running
              ? "border-neutral-600 text-neutral-300"
              : "border-emerald-500/40 text-emerald-300"
          )}
        >
          {running ? "Running…" : "Finished"}
        </span>
        <button
          type="button"
          aria-label="Close comparison"
          onClick={onClose}
          className="ml-auto -mr-1 rounded-full p-1 text-neutral-400 transition-colors duration-150 hover:bg-neutral-800 hover:text-neutral-100"
        >
          <X className="size-4" />
        </button>
      </header>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        {runs.map((run, side) => (
          <div key={side} className="flex min-w-0 items-center gap-1.5">
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: sideColors[side] }}
            />
            <span className="truncate">{algorithmInfo(run.algorithm).label}</span>
          </div>
        ))}
      </div>

      <dl className="mt-3 space-y-3">
        {METRICS.map((metric) => (
          <MetricRow key={metric.label} metric={metric} runs={runs} sideColors={sideColors} />
        ))}
      </dl>

      <div className="mt-3 flex items-center gap-1.5 border-t border-neutral-800 pt-3 text-[11px] text-neutral-400 tabular-nums">
        <span
          aria-hidden
          className="size-2 shrink-0 rounded-full"
          style={{ backgroundColor: colors.search }}
        />
        Explored by both: {sharedLines.toLocaleString()} roads ({Math.round(overlap * 100)}%)
      </div>

      {verdict && <p className="mt-2 text-xs text-neutral-200 text-pretty">{verdict}</p>}
    </section>
  );
}

function MetricRow({
  metric,
  runs,
  sideColors,
}: {
  metric: Metric;
  runs: [RunStats, RunStats];
  sideColors: string[];
}) {
  const values = runs.map(metric.value);
  const max = Math.max(...values.map((v) => v ?? 0));
  const [a, b] = values;
  // Only crown a winner once both searches have finished.
  const settled = runs.every((run) => run.phase !== "searching");
  const winner =
    settled && a !== null && b !== null && a !== b ? (a < b ? 0 : 1) : null;

  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-neutral-400">
        {metric.label}
      </dt>
      {runs.map((run, side) => {
        const value = values[side];
        return (
          <dd key={side} className="mt-1 flex items-center gap-2 text-xs tabular-nums">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-800">
              <div
                className="h-full origin-left rounded-full transition-transform duration-150 ease-out"
                style={{
                  backgroundColor: sideColors[side],
                  transform: `scaleX(${value !== null && max > 0 ? value / max : 0})`,
                }}
              />
            </div>
            <span
              className={cn(
                "flex w-24 items-center justify-end gap-1",
                winner === side ? "text-neutral-50 font-medium" : "text-neutral-300"
              )}
            >
              {winner === side && (
                <Check aria-label="Better" className="size-3 text-emerald-400" />
              )}
              {value !== null
                ? metric.format(value)
                : run.phase === "searching"
                  ? "…"
                  : "No route"}
            </span>
          </dd>
        );
      })}
    </div>
  );
}

/** One sentence on who did better, once both runs have finished. */
function summarize(runs: [RunStats, RunStats]): string {
  const [a, b] = runs;
  const name = (run: RunStats) => algorithmInfo(run.algorithm).short;

  if (!a.found && !b.found) return "Neither algorithm found a route.";
  if (a.found !== b.found) {
    const [found, missed] = a.found ? [a, b] : [b, a];
    return `Only ${name(found)} found a route; ${name(missed)} didn't.`;
  }

  const parts: string[] = [];
  const shorter = a.meters <= b.meters ? a : b;
  const longer = shorter === a ? b : a;
  const lengthGap = (longer.meters - shorter.meters) / longer.meters;
  parts.push(
    lengthGap < 0.005
      ? "Both routes are the same length"
      : `${name(shorter)}'s route is ${Math.round(lengthGap * 100)}% shorter`
  );

  const leaner = a.nodesExpanded <= b.nodesExpanded ? a : b;
  const heavier = leaner === a ? b : a;
  if (leaner.nodesExpanded < heavier.nodesExpanded) {
    const ratio = heavier.nodesExpanded / Math.max(1, leaner.nodesExpanded);
    parts.push(
      ratio >= 2
        ? `${name(leaner)} expanded ${ratio.toFixed(1)}× fewer nodes`
        : `${name(leaner)} expanded ${Math.round((1 - 1 / ratio) * 100)}% fewer nodes`
    );
  }
  return `${parts.join(", and ")}.`;
}
