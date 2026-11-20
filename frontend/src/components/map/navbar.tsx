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
import { PILL, PILL_BUTTON } from "./surface";

function NavButton({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={8}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * The controls along the top of the map.
 *
 * Wide screens: page buttons on the left, the search toolbar centred, GitHub on
 * the right. Narrow screens: the page buttons share the first row and the
 * toolbar takes the full width below them. The playback bar always sits under
 * the toolbar at the same width.
 */
export const Navbar = () => {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    // One provider so that, once a tooltip has shown, its neighbours open instantly.
    <TooltipProvider delayDuration={400} skipDelayDuration={300}>
      {/* Only the pills take pointer input, so the map still pans in the gaps. */}
      <nav className="pointer-events-none absolute inset-x-0 top-0 grid grid-cols-2 items-start gap-3 px-4 pt-[max(1rem,env(safe-area-inset-top))] md:grid-cols-[1fr_auto_1fr] md:px-6 md:pt-6">
        <div className="justify-self-start">
          <div className={PILL}>
            <NavButton label="Settings">
              <Button
                size="icon"
                aria-label="Settings"
                className={PILL_BUTTON}
                onClick={() => setSettingsOpen(true)}
              >
                <Settings className="size-5" />
              </Button>
            </NavButton>
            <NavButton label="Home">
              {/* A real navigation, so the city's memory is fully released. */}
              <Button asChild size="icon" className={PILL_BUTTON}>
                <a href="/" aria-label="Home">
                  <Home className="size-5" />
                </a>
              </Button>
            </NavButton>
          </div>
        </div>

        <div className="col-span-2 row-start-2 flex w-full flex-col items-stretch gap-2 sm:w-auto sm:justify-self-center md:col-span-1 md:col-start-2 md:row-start-1">
          <div role="toolbar" aria-label="Search" className={PILL}>
            <Dropdown />
            <StartButton />
            <SpeedSlider />
          </div>
          <PlaybackBar />
        </div>

        <div className="justify-self-end md:col-start-3 md:row-start-1">
          <div className={PILL}>
            <NavButton label="View on GitHub">
              <Button asChild size="icon" className={PILL_BUTTON}>
                <a
                  href="https://github.com/JaedonSpurlock01/routify-updated"
                  target="_blank"
                  rel="noreferrer"
                  aria-label="View on GitHub"
                >
                  <Github className="size-5" />
                </a>
              </Button>
            </NavButton>
          </div>
        </div>
      </nav>

      <SettingsSheet open={settingsOpen} setOpen={setSettingsOpen} />
    </TooltipProvider>
  );
};
