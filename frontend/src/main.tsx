/**
 * Boardroom AI — Application Entry Point
 */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/noto-nastaliq-urdu/400.css";
import "@fontsource/noto-nastaliq-urdu/600.css";
import "@fontsource/noto-nastaliq-urdu/700.css";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
