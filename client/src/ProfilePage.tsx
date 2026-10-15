import { useAuth } from "./auth";
import { CoinIcon, TrophyIcon } from "./Icons";

export default function ProfilePage() {
  const { user } = useAuth();
  if (!user) return null; // RequireAuth in App.tsx keeps logged-out visitors from getting here

  return (
    <div>
      <h1>{user.display_name}</h1>
      <p className="muted">{user.email}</p>
      <div className="hud" style={{ gap: 28, margin: "18px 0" }}>
        <span className="stat-pill gold" style={{ fontSize: "2rem" }}>
          <TrophyIcon />
          {user.trophies.toLocaleString()}
          <span className="muted" style={{ font: "500 0.95rem var(--body)" }}>
            trophies (best {user.best_trophies.toLocaleString()})
          </span>
        </span>
        <span className="stat-pill" style={{ fontSize: "2rem" }}>
          <CoinIcon />
          {user.tokens.toLocaleString()}
          <span className="muted" style={{ font: "500 0.95rem var(--body)" }}>
            tokens
          </span>
        </span>
      </div>
      <p className="muted">Your account is saved in the database, so it is still here after you log out and back in.</p>
    </div>
  );
}