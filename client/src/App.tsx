import type { ReactNode } from "react";
import { Link, Navigate, NavLink, Route, Routes } from "react-router";
import { useAuth } from "./auth";
import { LoginPage, RegisterPage } from "./AuthPages";
import BetsPage from "./BetsPage";
import CardsPage from "./CardsPage";
import DraftPage from "./DraftPage";
import { CoinIcon, TrophyIcon } from "./Icons";
import ModesPage from "./ModesPage";
import ProfilePage from "./ProfilePage";

// Only lets logged-in users see the page inside it
function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <p className="muted">Loading...</p>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

const navClass = ({ isActive }: { isActive: boolean }) => (isActive ? "nav-link active" : "nav-link");

export default function App() {
  const { user, loading, logout } = useAuth();

  return (
    <>
      <header className="topbar">
        <nav className="topbar-inner">
          <Link to="/" className="brand">
            Draft Day
          </Link>
          <NavLink to="/" end className={navClass}>
            Cards
          </NavLink>
          {user && (
            <NavLink to="/modes" className={navClass}>
              Play
            </NavLink>
          )}
          {user && (
            <NavLink to="/bets" className={navClass}>
              Bets
            </NavLink>
          )}
          <span className="spacer" />
          {loading ? null : user ? (
            <div className="hud">
              <span className="stat-pill gold" title="Trophies">
                <TrophyIcon />
                {user.trophies.toLocaleString()}
              </span>
              <span className="stat-pill" title="Tokens">
                <CoinIcon />
                {user.tokens.toLocaleString()}
              </span>
              <NavLink to="/profile" className="hud-name">
                {user.display_name}
              </NavLink>
              <button className="btn-small" onClick={logout}>
                Log out
              </button>
            </div>
          ) : (
            <div className="hud">
              <NavLink to="/login" className={navClass}>
                Log in
              </NavLink>
              <Link to="/register" className="btn btn-primary btn-small">
                Sign up
              </Link>
            </div>
          )}
        </nav>
      </header>

      <main className="shell page">
        <Routes>
          <Route path="/" element={<CardsPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route
            path="/profile"
            element={
              <RequireAuth>
                <ProfilePage />
              </RequireAuth>
            }
          />
          <Route
            path="/modes"
            element={
              <RequireAuth>
                <ModesPage />
              </RequireAuth>
            }
          />
          <Route
            path="/bets"
            element={
              <RequireAuth>
                <BetsPage />
              </RequireAuth>
            }
          />
          <Route
            path="/draft/:id"
            element={
              <RequireAuth>
                <DraftPage />
              </RequireAuth>
            }
          />
          <Route
            path="*"
            element={
              <p>
                Page not found. <Link to="/">Go to the cards</Link>
              </p>
            }
          />
        </Routes>
      </main>
    </>
  );
}