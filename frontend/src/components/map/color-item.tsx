import { useEffect, useRef, useState } from "react";
import { ColorPicker, useColor } from "react-color-palette";
import "react-color-palette/css";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

export const ColorItem = ({
  label,
  color,
  onChange,
}: {
  label: string;
  color: string;
  onChange: (hex: string) => void;
}) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [pickerColor, setPickerColor] = useColor(color);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="flex items-center flex-col gap-1 relative">
      <button
        type="button"
        aria-label={`${label} color`}
        aria-expanded={open}
        className="size-8 rounded-md border border-neutral-600 outline-none transition-[scale,box-shadow] duration-150 ease-out active:scale-95 focus-visible:ring-[3px] focus-visible:ring-ring/50"
        style={{ backgroundColor: color }}
        onClick={() => setOpen(!open)}
      />
      <p className="text-xs">{label}</p>
      {open && (
        <div
          className={cn(
            "absolute top-10 z-50 w-[300px] animate-panel-in",
            isMobile ? "right-0 origin-top-right" : "left-0 origin-top-left"
          )}
        >
          <ColorPicker
            color={pickerColor}
            onChange={(next) => {
              setPickerColor(next);
              onChange(next.hex.slice(0, 7));
            }}
          />
        </div>
      )}
    </div>
  );
};
