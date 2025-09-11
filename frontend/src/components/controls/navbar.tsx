import { Github, Home, Settings } from "lucide-react";
import { Button } from "../ui/button";
import { Dropdown } from "./dropdown";
import { StartButton } from "./start-button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";
import { SpeedSlider } from "./slider";
import { useState } from "react";
import { SettingsSheet } from "./settings-sheet";

export const Navbar = () => {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <nav className="absolute top-3 w-screen grid grid-cols-1 sm:grid-cols-3 px-4 gap-y-2 sm:gap-y-0">
      <div className="w-full row-start-1 flex items-center justify-between sm:block">
        <div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  className="bg-muted size-12 hover:bg-neutral-700 border border-border text-white rounded-full"
                  onClick={() => setSettingsOpen(!settingsOpen)}
                >
                  <Settings />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Settings</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              {/** Use anchor to ensure map is fully reset. Link caches are not cleared */}
              <a href="/">
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    className="bg-muted size-12 ml-2 hover:bg-neutral-700 border border-border text-white rounded-full"
                  >
                    <Home />
                  </Button>
                </TooltipTrigger>
              </a>
              <TooltipContent>
                <p>Home</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        <a
          href="https://github.com/JaedonSpurlock01/routify-updated"
          target="_blank"
          className="block sm:hidden"
        >
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  className="bg-muted size-12 hover:bg-neutral-700 focus:bg-neutral-700 border border-border text-white rounded-full"
                >
                  <Github />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>View on github</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </a>
      </div>

      <SettingsSheet open={settingsOpen} setOpen={setSettingsOpen} />

      <div className="w-full flex items-center justify-center sm:px-0 gap-6 row-start-2 sm:row-start-auto">
        <Dropdown />
        <StartButton />
        <SpeedSlider />
      </div>

      <div className="hidden justify-end items-center sm:flex">
        <a
          href="https://github.com/JaedonSpurlock01/routify-updated"
          target="_blank"
        >
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  className="bg-muted size-12 hover:bg-neutral-700 focus:bg-neutral-700 border border-border text-white rounded-full"
                >
                  <Github />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>View on github</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </a>
      </div>
    </nav>
  );
};
