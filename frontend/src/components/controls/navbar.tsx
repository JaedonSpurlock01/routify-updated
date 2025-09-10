import { Dropdown } from "./dropdown";
import { StartButton } from "./start-button";

export const Navbar = () => {
  return (
    <nav className="absolute top-3 w-screen flex justify-between">
      <Dropdown />
      <StartButton />
    </nav>
  );
};
