import { useAlgorithmContext } from "@/lib/context/context";
import { AlgorithmNames } from "@/lib/models/pathfinding-instance";
import { ChevronUp, ChevronDown } from "lucide-react";
import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Button } from "../ui/button";

export const Dropdown = () => {
  const [isOpen, setIsOpen] = useState(false);
  const { selectedAlgorithm, setSelectedAlgorithm } = useAlgorithmContext();

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          className="bg-muted hover:bg-neutral-700 h-12 border borer-border rounded-full w-40 sm:w-50
          flex relative"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="text-[8px] text-primary absolute top-[4px] left-[1rem]">
            Algorithm
          </span>
          <div className="flex flex-row justify-between w-full mt-1.5 overflow-hidden text-xs text-neutral-100">
            {selectedAlgorithm}
            {!isOpen ? <ChevronDown /> : <ChevronUp />}
          </div>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="bg-neutral-800 border !border-neutral-700 rounded-2xl w-50"
      >
        <DropdownMenuGroup className="space-y-1">
          {AlgorithmNames.map((algorithm, index) => (
            <DropdownMenuItem
              key={index}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedAlgorithm(algorithm);
              }}
              asChild
            >
              <Button className="w-full cursor-pointer text-xs text-neutral-300 hover:text-neutral-300 rounded-md hover:!bg-neutral-700 bg-neutral-800 dark:bg-neutral-800 hover:dark:bg-neutral-700 font-normal justify-start">
                {algorithm}
              </Button>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
