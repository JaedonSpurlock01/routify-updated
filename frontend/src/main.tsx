import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import "./index.css";

import Providers from "./providers";
import HomePage from "./pages/home";

const router = createBrowserRouter([
  {
    path: "/",
    element: <Providers />,
    children: [
      { index: true, element: <HomePage /> },
      {
        // three.js is most of the bundle; only load it once a city is opened.
        path: "map",
        lazy: async () => ({ Component: (await import("./pages/map")).default }),
      },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
);
