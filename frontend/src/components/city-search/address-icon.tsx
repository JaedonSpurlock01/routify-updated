import { AddressTypeToIcon } from "@/types/overpass-suggestion";
import {
  CircleQuestionMark,
  type LucideIcon,
  type LucideProps,
} from "lucide-react";

interface AddressIconProps extends LucideProps {
  type: "city" | "state" | "country" | "place";
}

export const AddressIcon = ({ type, ...props }: AddressIconProps) => {
  const IconComponent: LucideIcon | undefined = AddressTypeToIcon[type];

  if (!IconComponent) return <CircleQuestionMark {...props} />;

  return <IconComponent {...props} />;
};
