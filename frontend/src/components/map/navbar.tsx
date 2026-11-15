import { useState, type ReactNode } from "react";
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
import { SettingsSheet } from "./settings-sheet";
import { PlaybackBar } from "./playback-bar";

const ICON_BUTTON =
  "bg-muted size-12 hover:bg-neutral-700 border border-border text-white rounded-full";

function NavButton({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent sideOffset={6}>{label}</TooltipContent>
    </Tooltip>
  );
}

export const Navbar = () => {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    // One provider so that, once a tooltip has shown, its neighbours open instantly.
    <TooltipProvider delayDuration={400} skipDelayDuration={300}>
      {/* Only the controls take pointer input, so the map still pans in the gaps (and beside the playback bar). */}
      <nav className="pointer-events-none absolute top-3 inset-x-0 grid grid-cols-2 sm:grid-cols-3 items-center gap-y-2 px-4 [&>div]:pointer-events-auto">
        <div className="flex gap-2">
          <NavButton label="Settings">
            <Button
              size="icon"
              aria-label="Settings"
              className={ICON_BUTTON}
              onClick={() => setSettingsOpen(true)}
            >
              <Settings />
            </Button>
          </NavButton>
          <NavButton label="Home">
            {/* A real navigation, so the city's memory is fully released. */}
            <Button asChild size="icon" className={ICON_BUTTON}>
              <a href="/" aria-label="Home">
                <Home />
              </a>
            </Button>
          </NavButton>
        </div>

        <div className="col-span-2 row-start-2 sm:col-span-1 sm:row-start-auto flex items-center justify-center gap-6">
          <Dropdown />
          <StartButton />
          <SpeedSlider />
        </div>

        <div className="flex justify-end">
          <NavButton label="View on GitHub">
            <Button asChild size="icon" className={ICON_BUTTON}>
              <a
                href="https://github.com/JaedonSpurlock01/routify-updated"
                target="_blank"
                rel="noreferrer"
                aria-label="View on GitHub"
              >
                <Github />
              </a>
            </Button>
          </NavButton>
        </div>

        <section aria-label="Playback controls" className="col-span-2 sm:col-span-3 flex justify-center empty:hidden">
          <PlaybackBar />
        </section>
      </nav>

      <SettingsSheet open={settingsOpen} setOpen={setSettingsOpen} />
    </TooltipProvider>
  );
};
