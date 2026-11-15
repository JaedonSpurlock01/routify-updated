import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { Outlet } from "react-router-dom";
import { queryClient } from "./query-client";
import { CityProvider, SettingsProvider } from "./lib/state";

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
            position="bottom-left"
            toastOptions={{
              duration: 5000,
              style: {
                background: "#262626",
                color: "#fff",
                borderRadius: "999px",
                borderColor: "#404040",
                paddingInline: "1.25rem",
              },
            }}
          />
        </SettingsProvider>
      </CityProvider>
    </QueryClientProvider>
  );
}
