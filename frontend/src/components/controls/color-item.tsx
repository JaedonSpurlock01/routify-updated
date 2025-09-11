import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { useRef, useState, useEffect } from "react";
import { ColorPicker, useColor, type IColor } from "react-color-palette";

// @ts-expect-error It does exist
import "react-color-palette/css";

export const ColorItem = ({
  desc,
  setFocusedColor,
  initialColor,
}: {
  desc: string;
  setFocusedColor: React.Dispatch<
    React.SetStateAction<{ desc: string; color: string } | null>
  >;
  initialColor: string;
}) => {
  const [display, setDisplay] = useState(false);
  const colorPickerRef = useRef<HTMLDivElement>(null);
  const [currentColor, setCurrentColor] = useColor(initialColor);
  const isMobile = useIsMobile();

  const changeColor = (color: IColor) => {
    setCurrentColor(color);
    setFocusedColor({ desc, color: color.hex });
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        colorPickerRef.current &&
        event.target instanceof Node &&
        !colorPickerRef.current.contains(event.target)
      ) {
        setDisplay(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  useEffect(() => {
    // For some reason, the state gets lost when changing colors, so we are directly changing it
    // instead of relying on the div to automatically change
    const element = document.getElementById(desc);
    if (element) {
      element.style.backgroundColor = currentColor.hex;
    }
  }, [currentColor, desc]);

  return (
    <div className="flex items-center justify-center flex-col relative">
      <div
        id={desc} // add an id to the div
        className={`w-[2rem] h-[2rem] rounded-sm border border-neutral-600 hover:cursor-pointer`}
        style={{ backgroundColor: `#${currentColor}` }}
        onClick={() => setDisplay(!display)}
      />
      <p className="text-xs">{desc}</p>
      {display ? (
        <div
          className={cn(
            "absolute top-10 z-50 w-[300px]",
            isMobile ? "right-6" : "left-6"
          )}
          ref={colorPickerRef}
        >
          <ColorPicker onChange={changeColor} color={currentColor} />
        </div>
      ) : null}
    </div>
  );
};
