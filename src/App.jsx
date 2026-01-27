import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import MainLayout from "./layout/MainLayout";
import PlushGrid from "./components/PlushGrid";
import ComingSoon from "./pages/ComingSoon";

function App() {
  return (
    <Router>
      <Routes>
        <Route
          path="/"
          element={
            <ComingSoon />
          }
        />
        <Route
          path="/teste"
          element={
            <MainLayout>
              <PlushGrid />
            </MainLayout>
          }
        />
      </Routes>
    </Router>
  );
}

export default App;
