import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { queryClient } from "./query-client";
import { Outlet } from "react-router-dom";
import { PlaceContextProvider } from "./lib/context/place.context";
import { ThreeContextProvider } from "./lib/context/three.context";
import { AlgorithmContextProvider } from "./lib/context/algorithm.context";
import { ColorContextProvider } from "./lib/context/color.context";

export default function Providers() {
  return (
    <QueryClientProvider client={queryClient}>
      <PlaceContextProvider>
        <ThreeContextProvider>
          <AlgorithmContextProvider>
            <ColorContextProvider>
              <main className="dark bg-neutral-950 text-primary">
                <Outlet />
              </main>
              <Toaster position="bottom-left" />
            </ColorContextProvider>
          </AlgorithmContextProvider>
        </ThreeContextProvider>
      </PlaceContextProvider>
    </QueryClientProvider>
  );
}
