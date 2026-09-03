/**
 * Boardroom AI — App Router
 * ============================
 * Main application component with React Router setup.
 * Routes: / → Home, /meeting/:template → Form, /loading → Loading, /report → Report
 */

import { BrowserRouter, Routes, Route } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Settings from "./pages/Settings";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/settings" element={<Settings />} />
        {/* Catch-all route to redirect back to Dashboard */}
        <Route path="*" element={<Dashboard />} />
      </Routes>
    </BrowserRouter>
  );
}
