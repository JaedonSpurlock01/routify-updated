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
        <Button className="group bg-muted hover:bg-neutral-700 h-12 border border-border rounded-full w-40 sm:w-50 flex-col items-stretch gap-0 px-4 text-left">
          <span className="text-[10px] leading-none text-muted-foreground">
            {comparing ? "Comparing" : "Algorithm"}
          </span>
          <span className="flex items-center justify-between gap-1 text-xs text-neutral-100">
            {comparing ? (
              <span className="flex min-w-0 items-center gap-1.5">
                <Dot color={colors.compareA} />
                <span className="truncate">{algorithmInfo(algorithm).short}</span>
                <span className="text-muted-foreground">vs</span>
                <Dot color={colors.compareB} />
                <span className="truncate">{algorithmInfo(compareAlgorithm).short}</span>
              </span>
            ) : (
              <span className="truncate">{algorithmInfo(algorithm).label}</span>
            )}
            <ChevronDown className="shrink-0 transition-transform duration-200 ease-out group-data-[state=open]:rotate-180" />
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="dark bg-neutral-800 text-neutral-200 border-neutral-700 rounded-2xl w-50 p-1.5 duration-150 ease-out"
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
