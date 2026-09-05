/**
 * Boardroom AI — Application Entry Point
 */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

console.info("[Mashwara Build]", typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
