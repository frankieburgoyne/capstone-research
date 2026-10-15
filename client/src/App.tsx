import type { ReactNode } from "react";
import { Link, Navigate, NavLink, Route, Routes } from "react-router";
import { useAuth } from "./auth";
import { LoginPage, RegisterPage } from "./AuthPages";
import CardsPage from "./CardsPage";
import ProfilePage from "./ProfilePage";

// Only lets logged-in users see the page inside it
function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <p>Loading...</p>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

const linkStyle = ({ isActive }: { isActive: boolean }) => ({
  fontWeight: isActive ? "bold" : "normal",
  marginRight: 16,
});

export default function App() {
  const { user, loading, logout } = useAuth();

  return (
    <div style={{ maxWidth: 900, margin: "2rem auto", fontFamily: "sans-serif" }}>
      <nav style={{ display: "flex", alignItems: "center", marginBottom: 24 }}>
        <NavLink to="/" end style={linkStyle}>
          Cards
        </NavLink>
        <span style={{ flex: 1 }} />
        {loading ? null : user ? (
          <>
            <NavLink to="/profile" style={linkStyle}>
              {user.display_name} · {user.tokens} tokens
            </NavLink>
            <button onClick={logout}>Log out</button>
          </>
        ) : (
          <>
            <NavLink to="/login" style={linkStyle}>
              Log in
            </NavLink>
            <NavLink to="/register" style={linkStyle}>
              Sign up
            </NavLink>
          </>
        )}
      </nav>

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
          path="*"
          element={
            <p>
              Page not found. <Link to="/">Go to the cards</Link>
            </p>
          }
        />
      </Routes>
    </div>
  );
}