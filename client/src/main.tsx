/**
 * VideoForge — editor de clips de Twitch.
 * Copyright (C) 2026 Saúl Trujillo Rodríguez (@Saultr21)
 * https://github.com/Saultr21/video-forge
 *
 * Distribuido bajo licencia GNU GPL v3.0. Si reutilizas este código,
 * mantén esta atribución y publica las modificaciones bajo la misma licencia.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
