import {
  Building2,
  CircleQuestionMark,
  Image,
  MapPinHouse,
  MapPinned,
  type LucideIcon,
  type LucideProps,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  city: Building2,
  town: Building2,
  state: MapPinned,
  country: Image,
  place: MapPinHouse,
};

export const AddressIcon = ({ type, ...props }: LucideProps & { type: string }) => {
  const Icon = ICONS[type] ?? CircleQuestionMark;
  return <Icon {...props} />;
};
