import { useEffect, useState } from "react";
import { ColorItem } from "./color-item";
import { useColorContext } from "@/lib/context/context";
import { Switch } from "../ui/switch";

const COLOR_OPTIONS = {
  BACKGROUND: "Background",
  MAP: "Map",
  SEARCH: "Search",
  PATH: "Path",
};

type ColorOption = { color: string; desc: string };

export const Display = () => {
  const [focusedColor, setFocusedColor] = useState<{
    desc: string;
    color: string;
  } | null>(null);
  const {
    setMapColor,
    setBackgroundColor,
    setSearchColor,
    setPathColor,
    bloomToggle,
    setBloomToggle,
  } = useColorContext();
  const { backgroundColor, mapColor, searchColor, pathColor } =
    useColorContext();

  useEffect(() => {
    if (focusedColor === null) return;
    const hexColor = parseInt(focusedColor.color.replace("#", "0x"), 16);

    switch (focusedColor.desc) {
      case COLOR_OPTIONS.BACKGROUND:
        setBackgroundColor(focusedColor.color); // Must be in "" format
        break;

      case COLOR_OPTIONS.MAP:
        setMapColor(hexColor); // Must be in 0x format not ""
        break;

      case COLOR_OPTIONS.SEARCH:
        setSearchColor(hexColor); // Must be in 0x format not ""
        break;

      case COLOR_OPTIONS.PATH:
        setPathColor(hexColor); // Must be in 0x format not ""
        break;

      default:
        console.log("Something went really wrong here");
    }
    setFocusedColor(null);
  }, [
    focusedColor,
    setBackgroundColor,
    setPathColor,
    setSearchColor,
    setMapColor,
  ]);

  const colors: ColorOption[] = [
    {
      color: backgroundColor.replace("#", ""),
      desc: COLOR_OPTIONS.BACKGROUND,
    },
    { color: mapColor.toString(16), desc: COLOR_OPTIONS.MAP },
    { color: searchColor.toString(16), desc: COLOR_OPTIONS.SEARCH },
    { color: pathColor.toString(16), desc: COLOR_OPTIONS.PATH },
  ];

  return (
    <div>
      <p>Display</p>
      <div className="text-base flex flex-row items-center flex-wrap">
        <p className="text-neutral-300">Colors</p>
        <div className="flex flex-row space-x-3 ml-auto">
          {colors.map((item, index) => (
            <ColorItem
              key={index}
              desc={item.desc}
              setFocusedColor={setFocusedColor}
              initialColor={`#${item.color.padStart(6, "0")}`}
            />
          ))}
        </div>
      </div>
      <div className="text-base flex flex-row mt-3 -mb-2">
        <p className="text-neutral-300">Bloom</p>
        <span className="ml-auto">
          <Switch
            checked={bloomToggle}
            onCheckedChange={() => {
              setBloomToggle(!bloomToggle);
            }}
          />
        </span>
      </div>
    </div>
  );
};
