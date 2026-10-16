import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Link, Navigate, NavLink, Route, Routes, useLocation } from "react-router";
import AnimatedNumber from "./AnimatedNumber";
import { useAuth } from "./auth";
import { LoginPage, RegisterPage } from "./AuthPages";
import BetsPage from "./BetsPage";
import CardsPage from "./CardsPage";
import { ChallengePage, NewChallengePage } from "./ChallengePages";
import ChatPage from "./ChatPage";
import DraftPage from "./DraftPage";
import FriendsPage from "./FriendsPage";
import { CoinIcon, TrophyIcon } from "./Icons";
import ModesPage from "./ModesPage";
import ProfilePage from "./ProfilePage";
import { useToast } from "./Toast";

// Only lets logged-in users see the page inside it
function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <p className="muted">Loading...</p>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

const navClass = ({ isActive }: { isActive: boolean }) => (isActive ? "nav-link active" : "nav-link");

type Summary = {
  unread_messages: number;
  friend_requests: number;
  challenge_invites: number;
  challenges_to_draft: number;
};

// Checks every 15 seconds for new friend requests, challenges and messages.
// Pages can ask for an instant check by sending a "social-changed" event.
function useSocialSummary(loggedIn: boolean): Summary | null {
  const [summary, setSummary] = useState<Summary | null>(null);
  const previous = useRef<Summary | null>(null);
  const toast = useToast();
  const location = useLocation();
  const path = useRef(location.pathname);
  path.current = location.pathname;

  useEffect(() => {
    if (!loggedIn) {
      setSummary(null);
      previous.current = null;
      return;
    }
    let alive = true;
    const load = () =>
      fetch("/api/friends/summary")
        .then((r) => (r.ok ? r.json() : null))
        .then((s: Summary | null) => {
          if (!alive || !s) return;
          const p = previous.current;
          if (p) {
            if (s.friend_requests > p.friend_requests) toast("You have a new friend request");
            if (s.challenge_invites > p.challenge_invites) toast("A friend challenged you");
            if (s.unread_messages > p.unread_messages && !path.current.startsWith("/chat")) toast("New message");
          }
          previous.current = s;
          setSummary(s);
        })
        .catch(() => {});
    load();
    const timer = setInterval(load, 15000);
    window.addEventListener("social-changed", load);
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener("social-changed", load);
    };
  }, [loggedIn, toast]);

  return summary;
}

export default function App() {
  const { user, loading, logout } = useAuth();
  const summary = useSocialSummary(Boolean(user));
  const socialCount = summary
    ? summary.unread_messages + summary.friend_requests + summary.challenge_invites + summary.challenges_to_draft
    : 0;

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
            <>
              <NavLink to="/modes" className={navClass}>
                Play
              </NavLink>
              <NavLink to="/bets" className={navClass}>
                Bets
              </NavLink>
              <NavLink to="/friends" className={navClass}>
                Friends
                {socialCount > 0 && <span className="badge">{socialCount}</span>}
              </NavLink>
            </>
          )}
          <span className="spacer" />
          {loading ? null : user ? (
            <div className="hud">
              <span className="stat-pill gold" title="Trophies">
                <TrophyIcon />
                <AnimatedNumber value={user.trophies} />
              </span>
              <span className="stat-pill" title="Tokens">
                <CoinIcon />
                <AnimatedNumber value={user.tokens} />
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
          <Route path="/profile" element={<RequireAuth><ProfilePage /></RequireAuth>} />
          <Route path="/modes" element={<RequireAuth><ModesPage /></RequireAuth>} />
          <Route path="/bets" element={<RequireAuth><BetsPage /></RequireAuth>} />
          <Route path="/friends" element={<RequireAuth><FriendsPage /></RequireAuth>} />
          <Route path="/friends/:friendId/challenge" element={<RequireAuth><NewChallengePage /></RequireAuth>} />
          <Route path="/chat/:friendId" element={<RequireAuth><ChatPage /></RequireAuth>} />
          <Route path="/challenges/:id" element={<RequireAuth><ChallengePage /></RequireAuth>} />
          <Route path="/draft/:id" element={<RequireAuth><DraftPage /></RequireAuth>} />
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