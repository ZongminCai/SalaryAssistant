import { Link, Route, Routes } from "react-router-dom";
import Home from "./pages/Home";
import PositionWorkbench from "./pages/PositionWorkbench";
import UnifiedWorkbench from "./pages/UnifiedWorkbench";

function App() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <Link to="/" style={{ color: "inherit", textDecoration: "none" }}>
          <h1>佳帮手 · 薪酬评级助手</h1>
        </Link>
        <span className="subtitle">薪酬专员季度评级与定薪工作台</span>
      </header>
      <main className="app-main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/unified" element={<UnifiedWorkbench />} />
          <Route path="/position/:positionKey" element={<PositionWorkbench />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
