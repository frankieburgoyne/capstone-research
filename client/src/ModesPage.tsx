import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "./auth";

type Mode = {
  slug: string;
  name: string;
  description: string;
  unlock_trophies: number;
  min_season: number;
  max_season: number;
  random_season: boolean;
  allowed_tiers: string[];
  budget: number;
  unlocked: boolean;
};

function poolText(m: Mode): string {
  if (m.min_season === m.max_season) return `${m.min_season} season`;
  if (m.random_season) return `random season from ${m.min_season} to ${m.max_season}`;
  return `${m.min_season} to ${m.max_season}`;
}

export default function ModesPage() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const [modes, setModes] = useState<Mode[]>([]);
  const [devTools, setDevTools] = useState(false);
  const [status, setStatus] = useState("Loading...");

  const loadModes = useCallback(() => {
    fetch("/api/modes")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.modes)) {
          setModes(d.modes);
          setDevTools(Boolean(d.devTools));
          setStatus("");
        } else {
          setStatus(d.error ?? "Could not load game modes.");
        }
      })
      .catch(() => setStatus("Could not reach the server."));
  }, []);

  useEffect(() => {
    loadModes();
  }, [loadModes]);

  // Testing only: change trophies, then reload the user and the mode list
  async function changeTrophies(delta: number) {
    await fetch("/api/modes/dev-trophies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ delta }),
    });
    await refresh();
    loadModes();
  }

  // Start a draft in a mode (or return to the one already open) and go to its page
  async function startDraft(slug: string) {
    setStatus("");
    try {
      const res = await fetch("/api/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modeSlug: slug }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) navigate(`/draft/${data.id}`);
      else setStatus(data.error ?? "Could not start the draft.");
    } catch {
      setStatus("Could not reach the server.");
    }
  }

  if (!user) return null;

  return (
    <div>
      <h1>Game modes</h1>
      <p>
        You have <strong>{user.trophies}</strong> trophies. Your best is{" "}
        <strong>{user.best_trophies}</strong>, and modes unlock based on your best.
      </p>

      {devTools && (
        <p style={{ background: "#fff8e1", color: "#111", padding: 8, borderRadius: 6 }}>
          Testing tools:{" "}
          <button onClick={() => changeTrophies(50)}>+50</button>{" "}
          <button onClick={() => changeTrophies(200)}>+200</button>{" "}
          <button onClick={() => changeTrophies(-50)}>-50</button>
        </p>
      )}

      {status && <p>{status}</p>}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {modes.map((m) => (
          <div
            key={m.slug}
            style={{
              border: `2px solid ${m.unlocked ? "#2e7d32" : "#999"}`,
              borderRadius: 10,
              padding: 14,
              opacity: m.unlocked ? 1 : 0.6,
            }}
          >
            <h3 style={{ margin: "0 0 6px" }}>{m.name}</h3>
            <p style={{ margin: "0 0 8px" }}>{m.description}</p>
            <p style={{ margin: "0 0 8px", fontSize: 14 }}>
              Pool: {poolText(m)} · Cards: {m.allowed_tiers.join(", ")} · Budget: {m.budget} tokens
            </p>
            {m.unlocked ? (
              <button onClick={() => startDraft(m.slug)}>Draft</button>
            ) : (
              <span>
                Locked: reach {m.unlock_trophies} trophies ({m.unlock_trophies - user.best_trophies}{" "}
                more)
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}