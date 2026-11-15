import { ArrowLeftCircle } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "../ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "../ui/drawer";
import { Display } from "./display";

const PANEL = "p-4 !bg-neutral-800 border-neutral-700 text-neutral-100";

export const SettingsSheet = ({
  open,
  setOpen,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
}) => {
  const isMobile = useIsMobile();

  const content = (
    <div className="space-y-6">
      <Display />
      <Keybinds />
      <About />
      <a
        href="/"
        className="flex w-fit items-center gap-2 text-sm text-neutral-200 transition-colors duration-150 hover:text-white"
      >
        <ArrowLeftCircle size={18} />
        Try another city
      </a>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent className={`${PANEL} max-h-[85dvh] pb-[max(1rem,env(safe-area-inset-bottom))]`}>
          <DrawerTitle className="sr-only">Settings</DrawerTitle>
          <DrawerDescription className="sr-only">
            Display options, keyboard shortcuts and about
          </DrawerDescription>
          <div className="overflow-y-auto pt-4">{content}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="left" className={PANEL}>
        <SheetTitle className="sr-only">Settings</SheetTitle>
        <SheetDescription className="sr-only">
          Display options, keyboard shortcuts and about
        </SheetDescription>
        {content}
      </SheetContent>
    </Sheet>
  );
};

const KEYBINDS = [
  { keys: "Space", desc: "Start / pause / resume search" },
  { keys: "Esc", desc: "Stop and erase search" },
  { keys: "D", desc: "Clear points" },
  { keys: "C", desc: "Reset map" },
  { keys: "B", desc: "Toggle bloom" },
];

const Keybinds = () => (
  <section>
    <h2>Keybinds</h2>
    <dl className="mt-2 grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1.5 text-sm text-neutral-300">
      {KEYBINDS.map(({ keys, desc }) => (
        <div key={keys} className="contents">
          <dt>
            <kbd className="inline-block min-w-7 rounded-md border border-neutral-600 bg-neutral-700/60 px-1.5 py-0.5 text-center font-sans text-xs text-neutral-100">
              {keys}
            </kbd>
          </dt>
          <dd>{desc}</dd>
        </div>
      ))}
    </dl>
  </section>
);

const LINK = "text-rose-400 hover:underline";

const About = () => (
  <section>
    <h2>About</h2>
    <div className="mt-2 space-y-3 text-xs text-neutral-300 text-pretty">
      <p>
        Routify is a website developed by{" "}
        <a
          href="https://github.com/JaedonSpurlock01"
          target="_blank"
          rel="noreferrer"
          className={LINK}
        >
          @JaedonSpurlock01
        </a>
        . It downloads roads from{" "}
        <a
          href="https://www.openstreetmap.org/about/"
          target="_blank"
          rel="noreferrer"
          className={LINK}
        >
          OpenStreetMap
        </a>{" "}
        and renders them with ThreeJS.
      </p>
      <p>
        To start pathfinding, double click on the map to place start and end
        points. Afterwards, press the green button to start finding a path.
      </p>
      <p>
        If you like this project, feel free to check out the{" "}
        <a
          href="https://github.com/JaedonSpurlock01/routify-updated"
          target="_blank"
          rel="noreferrer"
          className={LINK}
        >
          source code
        </a>
        !
      </p>
    </div>
  </section>
);
