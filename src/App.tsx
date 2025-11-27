import React from "react";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import MainUI from "./windows/MainUI";

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<MainUI />} />
        {/* Fallback to root */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}
