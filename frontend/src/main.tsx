import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Analytics } from "@vercel/analytics/react";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import "./index.css";

import Providers from "./providers";
import HomePage from "./pages/home";
import MapPage from "./pages/map";

const router = createBrowserRouter([
  {
    path: "/",
    element: <Providers />,
    children: [
      {
        path: "/",
        element: <HomePage />,
      },
      {
        path: "/map",
        element: <MapPage />,
      },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
    <Analytics />
  </StrictMode>
);
