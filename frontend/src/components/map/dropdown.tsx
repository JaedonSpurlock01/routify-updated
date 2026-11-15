import { ChevronDown } from "lucide-react";
import { useMapSession } from "@/lib/state";
import { ALGORITHMS } from "@/lib/pathfinding/search";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Button } from "../ui/button";

export const Dropdown = () => {
  const { algorithm, setAlgorithm } = useMapSession();
  const label = ALGORITHMS.find((a) => a.id === algorithm)?.label;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className="group bg-muted hover:bg-neutral-700 h-12 border border-border rounded-full w-40 sm:w-50 flex-col items-stretch gap-0 px-4 text-left">
          <span className="text-[10px] leading-none text-muted-foreground">
            Algorithm
          </span>
          <span className="flex items-center justify-between text-xs text-neutral-100">
            <span className="truncate">{label}</span>
            <ChevronDown className="transition-transform duration-200 ease-out group-data-[state=open]:rotate-180" />
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="dark bg-neutral-800 text-neutral-200 border-neutral-700 rounded-2xl w-50 p-1.5 duration-150 ease-out"
      >
        <DropdownMenuRadioGroup
          value={algorithm}
          onValueChange={(id) => setAlgorithm(id as typeof algorithm)}
        >
          {ALGORITHMS.map(({ id, label }) => (
            <DropdownMenuRadioItem
              key={id}
              value={id}
              className="text-xs rounded-lg cursor-pointer focus:bg-neutral-700 focus:text-neutral-50"
            >
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
