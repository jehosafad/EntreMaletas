import React from "react";
import { Navigate, Route, Routes, Link, Outlet, useLocation } from "react-router-dom";
import Home from "./pages/Home";
import ViajeDetalle from "./pages/ViajeDetalle";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Panel from "./pages/Panel";
import { useAuth } from "./auth/AuthContext";

function Layout() {
  const { isAuthed, isAdmin, user, logout } = useAuth();
  const loc = useLocation();

  return (
    <>
      <header className="nav">
        <div className="navInner">
          <Link to="/" className="brand">
            EntreMaletas
            <span className="brandDot" />
          </Link>

          <nav className="navRight">
            <Link className="navLink" to="/">
              Descubrir
            </Link>

            {isAuthed ? (
              <>
                <Link className="navLink" to="/panel">
                  {isAdmin ? "Panel admin" : "Mis viajes"}
                </Link>

                <span className="pill">
                  {isAdmin ? "admin" : "user"} · @{user?.username}
                </span>

                <button className="btn ghost" onClick={() => logout()}>
                  Salir
                </button>
              </>
            ) : (
              <>
                <Link
                  className={`btn ghost ${loc.pathname === "/login" ? "active" : ""}`}
                  to="/login"
                >
                  Login
                </Link>
                <Link className="btn" to="/register">
                  Crear cuenta
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="container">
        <Outlet />
      </main>

      <footer className="footer">
        <div className="footerInner">
          <span className="muted">© {new Date().getFullYear()} EntreMaletas</span>
          <span className="muted">Hecho con ✈️ + café</span>
        </div>
      </footer>
    </>
  );
}

function RequireAuth({ children }) {
  const { isAuthed } = useAuth();
  const loc = useLocation();
  if (!isAuthed) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/viaje/:slug" element={<ViajeDetalle />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        <Route
          path="/panel"
          element={
            <RequireAuth>
              <Panel />
            </RequireAuth>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}