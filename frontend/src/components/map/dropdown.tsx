import { ChevronDown } from "lucide-react";
import { useMapSession, useSettings } from "@/lib/state";
import { ALGORITHMS, algorithmInfo } from "@/lib/pathfinding/search";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Button } from "../ui/button";
import { cn } from "@/lib/utils";
import { CAPTION, PILL_BUTTON } from "./surface";

const ITEM = "text-xs rounded-lg cursor-pointer focus:bg-neutral-700 focus:text-neutral-50";
const LABEL = "text-[10px] font-normal text-muted-foreground px-2 pt-1.5 pb-1";
const NONE = "none";

function Dot({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      className="inline-block size-2 shrink-0 rounded-full"
      style={{ backgroundColor: color }}
    />
  );
}

export const Dropdown = () => {
  const { algorithm, setAlgorithm, compareAlgorithm, setCompareAlgorithm } =
    useMapSession();
  const { colors } = useSettings();
  const comparing = compareAlgorithm !== null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          className={cn(
            PILL_BUTTON,
            "group h-11 w-auto min-w-0 flex-1 justify-between gap-2 px-3 text-left sm:w-52 sm:flex-none sm:px-4"
          )}
        >
          {/* Two lines either way: caption over the algorithm, or one line per compared algorithm. */}
          <span className="flex min-w-0 flex-col gap-1.5 text-xs leading-none font-medium text-neutral-100">
            {comparing ? (
              <>
                <span className="flex min-w-0 items-center gap-1.5">
                  <Dot color={colors.compareA} />
                  <span className="truncate">{algorithmInfo(algorithm).short}</span>
                </span>
                <span className="flex min-w-0 items-center gap-1.5">
                  <Dot color={colors.compareB} />
                  <span className="truncate">{algorithmInfo(compareAlgorithm).short}</span>
                </span>
              </>
            ) : (
              <>
                <span className={cn(CAPTION, "font-normal")}>Algorithm</span>
                <span className="truncate">{algorithmInfo(algorithm).label}</span>
              </>
            )}
          </span>
          <ChevronDown className="shrink-0 transition-transform duration-200 ease-out group-data-[state=open]:rotate-180" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={10}
        collisionPadding={16}
        className="dark bg-neutral-900 text-neutral-200 border-white/10 shadow-lg shadow-black/40 rounded-2xl w-52 p-1.5 duration-150 ease-out"
      >
        <DropdownMenuLabel className={LABEL}>Algorithm</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={algorithm}
          onValueChange={(id) => setAlgorithm(id as typeof algorithm)}
        >
          {ALGORITHMS.map(({ id, label }) => (
            <DropdownMenuRadioItem key={id} value={id} className={ITEM}>
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator className="bg-neutral-700" />
        <DropdownMenuLabel className={LABEL}>Compare with</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={compareAlgorithm ?? NONE}
          onValueChange={(id) =>
            setCompareAlgorithm(id === NONE ? null : (id as typeof algorithm))
          }
        >
          <DropdownMenuRadioItem value={NONE} className={ITEM}>
            Nothing
          </DropdownMenuRadioItem>
          {ALGORITHMS.filter(({ id }) => id !== algorithm).map(({ id, label }) => (
            <DropdownMenuRadioItem key={id} value={id} className={ITEM}>
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
