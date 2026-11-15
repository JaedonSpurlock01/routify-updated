import { useSettings, type Colors } from "@/lib/state";
import { Switch } from "../ui/switch";
import { ColorItem } from "./color-item";

const COLOR_OPTIONS: { key: keyof Colors; label: string }[] = [
  { key: "background", label: "Background" },
  { key: "map", label: "Map" },
  { key: "search", label: "Search" },
  { key: "path", label: "Path" },
];

export const Display = () => {
  const { colors, setColor, bloom, setBloom } = useSettings();

  return (
    <section>
      <h2>Display</h2>
      <div className="text-base flex items-center flex-wrap mt-2">
        <p className="text-neutral-300">Colors</p>
        <div className="flex gap-3 ml-auto">
          {COLOR_OPTIONS.map(({ key, label }) => (
            <ColorItem
              key={key}
              label={label}
              color={colors[key]}
              onChange={(hex) => setColor(key, hex)}
            />
          ))}
        </div>
      </div>
      <label className="text-base flex items-center mt-3">
        <span className="text-neutral-300">Bloom</span>
        <Switch
          className="ml-auto"
          checked={bloom}
          onCheckedChange={setBloom}
        />
      </label>
    </section>
  );
};
