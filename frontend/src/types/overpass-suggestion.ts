import {
  Building2,
  Image,
  MapPinHouse,
  MapPinned,
  type LucideIcon,
} from "lucide-react";

export interface NominatimSuggestion {
  name: string;
  display_name: string;
  type: string;
  osm_id: number;
  osm_type: string;
  boundingbox: [string, string, string, string];
  addresstype: "city" | "state" | "country" | "place";
}

export const AddressTypeToIcon: Record<
  NominatimSuggestion["addresstype"],
  LucideIcon
> = {
  city: Building2,
  state: MapPinned,
  country: Image,
  place: MapPinHouse,
};
