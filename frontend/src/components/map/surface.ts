/**
 * Shared look for everything that floats over the map, so the controls read
 * as one set: the same surface, the same 44px control height inside a 4px
 * padded pill (52px overall), and the same hover.
 *
 * No backdrop blur: the map canvas redraws every frame during a search, and a
 * blurred surface would be re-blurred each frame. Near-opaque instead, so text
 * underneath (the city name, under the comparison panel on phones) can't bleed
 * through.
 */
export const SURFACE =
  "border border-white/10 bg-neutral-900/95 text-neutral-100 shadow-lg shadow-black/40";

/** A row of controls on one surface. */
export const PILL = `${SURFACE} pointer-events-auto flex items-center gap-1 rounded-full p-1`;

/** A borderless round control inside a pill. */
export const PILL_BUTTON =
  "size-11 shrink-0 rounded-full bg-transparent text-neutral-100 shadow-none hover:bg-white/10 hover:text-white disabled:opacity-40";

/** The small caption above a control's value ("Algorithm", "Speed"). */
export const CAPTION = "text-[11px] leading-none text-neutral-400";
