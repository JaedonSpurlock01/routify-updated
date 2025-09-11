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

export const SettingsSheet = ({
  open,
  setOpen,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
}) => {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerTitle className="sr-only">Settings</DrawerTitle>
        <DrawerDescription className="sr-only">Settings</DrawerDescription>
        <DrawerContent className="p-4 h-[600px] !bg-neutral-800 border-neutral-700 text-neutral-100 space-y-4">
          <Display />
          <Keybinds />
          <About />
          <a href="/" className="flex w-fit items-center gap-2 mt-4 text-sm">
            <ArrowLeftCircle size={18} />
            <p>Try another city</p>
          </a>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTitle className="sr-only">Settings</SheetTitle>
      <SheetDescription className="sr-only">Settings</SheetDescription>
      <SheetContent
        side="left"
        className="p-4 !bg-neutral-800 border-neutral-700 text-neutral-100"
      >
        <Display />
        <Keybinds />
        <About />
        <a href="/" className="flex w-fit items-center gap-2 mt-4 text-sm">
          <ArrowLeftCircle size={18} />
          <p>Try another city</p>
        </a>
      </SheetContent>
    </Sheet>
  );
};

const KeybindLabel = ({ keybind, desc }: { keybind: string; desc: string }) => {
  return (
    <div className="flex flex-col items-center justify-center">
      <p>{keybind}</p>
      <p className="text-xs">{desc}</p>
    </div>
  );
};

const Keybinds = () => {
  return (
    <div>
      Keybinds
      <div className="text-lg flex flex-row flex-wrap items-center justify-center space-x-4 text-neutral-300">
        {[
          { key: "B", desc: "Toggle Bloom" },
          { key: "C", desc: "Reset Map" },
          { key: "D", desc: "Clear Points" },
          { key: "Space", desc: "Start Search" },
        ].map((keybind, index) => (
          <KeybindLabel key={index} keybind={keybind.key} desc={keybind.desc} />
        ))}
      </div>
    </div>
  );
};
const About = () => {
  return (
    <div>
      About{" "}
      <div className="text-xs text-neutral-300">
        Routify is a website developed by{" "}
        <a
          href="https://github.com/JaedonSpurlock01"
          target="_blank"
          className="text-rose-500 hover:underline"
        >
          @JaedonSpurlock01
        </a>
        . It downloads roads from{" "}
        <a
          href="https://www.openstreetmap.org/about/"
          target="_blank"
          className="text-rose-500 hover:underline"
        >
          OpenStreetMap
        </a>{" "}
        and renders them with ThreeJS.
        <br />
        <br />
        To start pathfinding, double click on the map to place start and end
        points. Afterwards, press the green button to start finding a path.
        <br />
        <br />
        If you like this project, feel free to check out the{" "}
        <a
          href="https://github.com/JaedonSpurlock01/routify"
          target="_blank"
          className="text-rose-500 hover:underline"
        >
          source code
        </a>
        !
      </div>
    </div>
  );
};
