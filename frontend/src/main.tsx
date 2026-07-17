import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import "./index.css";
import { AiAssistantProvider } from "./components/assistant/AiAssistantProvider";
import { AppShell } from "./components/layout/AppShell";
import { DashboardPage } from "./pages/DashboardPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { OverviewPage } from "./pages/OverviewPage";
import { PredictionsPage } from "./pages/PredictionsPage";
import { ResultsPage } from "./pages/ResultsPage";

const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <OverviewPage /> },
      { path: "dashboard", element: <DashboardPage /> },
      { path: "predictions", element: <PredictionsPage /> },
      { path: "results", element: <ResultsPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AiAssistantProvider>
      <RouterProvider router={router} />
    </AiAssistantProvider>
  </React.StrictMode>,
);
