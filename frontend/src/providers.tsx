import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { Outlet } from "react-router-dom";
import { queryClient } from "./query-client";
import { CityProvider, SettingsProvider } from "./lib/state";
import { SURFACE } from "./components/map/surface";

export default function Providers() {
  return (
    <QueryClientProvider client={queryClient}>
      <CityProvider>
        <SettingsProvider>
          <div className="dark bg-neutral-950 text-primary">
            <Outlet />
          </div>
          <Toaster
            theme="dark"
            // Just under the map controls (see --toast-top), clear of the
            // city name and comparison panel in the bottom corners.
            position="top-center"
            offset={{ top: "var(--toast-top)" }}
            mobileOffset={{ top: "var(--toast-top)" }}
            gap={8}
            toastOptions={{
              duration: 5000,
              // Drawn like the map controls rather than sonner's own look.
              unstyled: true,
              classNames: {
                toast: `${SURFACE} flex min-h-13 w-full items-center gap-3 rounded-2xl px-4 py-2.5 text-xs`,
                title: "font-medium leading-snug",
                icon: "flex size-4 shrink-0 items-center [&>svg]:size-4",
                success: "[&_[data-icon]]:text-[#46b780]",
                error: "[&_[data-icon]]:text-[#ff4252]",
              },
            }}
          />
        </SettingsProvider>
      </CityProvider>
    </QueryClientProvider>
  );
}
