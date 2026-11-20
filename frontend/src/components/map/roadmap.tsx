import { ChevronRight } from "lucide-react";
import { roadmap, type RoadmapStatus } from "@/lib/data/roadmap";

const STATUS: Record<Exclude<RoadmapStatus, "planned">, { label: string; className: string }> = {
  "in-progress": { label: "In progress", className: "border-amber-400/40 text-amber-300" },
  shipped: { label: "Shipped", className: "border-emerald-400/40 text-emerald-300" },
};

/** What's coming next, one collapsible group per theme. Planned items carry no badge. */
export const Roadmap = () => (
  <section>
    <h2>Roadmap</h2>
    <p className="mt-2 text-xs text-neutral-400 text-pretty">
      Features on the way. Have an idea?{" "}
      <a
        href="https://github.com/JaedonSpurlock01/routify-updated/issues"
        target="_blank"
        rel="noreferrer"
        className="text-rose-400 hover:underline"
      >
        Suggest it on GitHub
      </a>
      .
    </p>
    <div className="mt-2 divide-y divide-neutral-700/70">
      {roadmap.map((group) => (
        <details key={group.title} className="group py-1">
          <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md py-1.5 text-sm text-neutral-200 transition-colors duration-150 select-none hover:text-white [&::-webkit-details-marker]:hidden">
            <ChevronRight
              size={14}
              aria-hidden
              className="shrink-0 text-neutral-500 transition-transform duration-150 group-open:rotate-90"
            />
            {group.title}
            <span className="ml-auto text-xs tabular-nums text-neutral-500">
              {group.items.length}
            </span>
          </summary>
          <ul className="space-y-2.5 pt-1 pb-2 pl-[22px]">
            {group.items.map((item) => {
              const badge = item.status === "planned" ? null : STATUS[item.status];
              return (
                <li key={item.title}>
                  <div className="flex items-center gap-2 text-sm text-neutral-100">
                    {item.title}
                    {badge && (
                      <span
                        className={`rounded-full border px-1.5 text-[10px] leading-4 ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-neutral-400 text-pretty">{item.summary}</p>
                </li>
              );
            })}
          </ul>
        </details>
      ))}
    </div>
  </section>
);
