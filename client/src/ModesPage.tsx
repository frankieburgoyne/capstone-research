import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "./auth";
import { CoinIcon } from "./Icons";

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
  entry_fee: number;
  win_trophies: number;
  loss_trophies: number;
  unlocked: boolean;
};

type Bonus = { amount: number; available: boolean; next_at: string | null };

function poolText(m: Mode): string {
  if (m.min_season === m.max_season) return `${m.min_season} season`;
  if (m.random_season) return `Random season, ${m.min_season} to ${m.max_season}`;
  return `${m.min_season} to ${m.max_season}`;
}

// "5h 12m" until a time in the future
function timeLeft(iso: string | null): string {
  if (!iso) return "";
  const minutes = Math.max(1, Math.ceil((new Date(iso).getTime() - Date.now()) / 60000));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function ModesPage() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const [modes, setModes] = useState<Mode[]>([]);
  const [bonus, setBonus] = useState<Bonus | null>(null);
  const [devTools, setDevTools] = useState(false);
  const [status, setStatus] = useState("Loading...");

  const loadModes = useCallback(() => {
    fetch("/api/modes")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.modes)) {
          setModes(d.modes);
          setBonus(d.bonus ?? null);
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

  // Testing only: change trophies or tokens, then reload the user and the mode list
  async function devChange(path: string, delta?: number) {
    await fetch(`/api/modes/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ delta }),
    });
    await refresh();
    loadModes();
  }

  async function claimBonus() {
    setStatus("");
    try {
      const res = await fetch("/api/modes/daily-bonus", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setStatus(data.error ?? "Could not claim the bonus.");
      await refresh();
      loadModes();
    } catch {
      setStatus("Could not reach the server.");
    }
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
      if (res.ok) {
        await refresh(); // the entry fee was just taken from your tokens
        navigate(`/draft/${data.id}`);
      } else {
        setStatus(data.error ?? "Could not start the draft.");
      }
    } catch {
      setStatus("Could not reach the server.");
    }
  }

  if (!user) return null;

  return (
    <div>
      <h1>Pick a game</h1>
      <p className="muted">
        Pay the entry fee, draft a lineup from the pool, and play a computer opponent. A win pays back
        double your entry. A loss keeps it. Modes unlock at your best trophy count (yours: {user.best_trophies}).
      </p>

      {bonus && (
        <div className="bonus">
          <span className="stat-pill">
            <CoinIcon />+{bonus.amount}
          </span>
          {bonus.available ? (
            <>
              <p>Your free daily bonus is ready.</p>
              <button className="btn-primary btn-small" onClick={claimBonus}>
                Claim {bonus.amount} tokens
              </button>
            </>
          ) : (
            <p className="muted">Daily bonus claimed. The next one is ready in {timeLeft(bonus.next_at)}.</p>
          )}
        </div>
      )}

      {devTools && (
        <div className="devtools">
          <strong>Testing tools</strong>
          <button onClick={() => devChange("dev-trophies", 50)}>+50 trophies</button>
          <button onClick={() => devChange("dev-trophies", 200)}>+200 trophies</button>
          <button onClick={() => devChange("dev-trophies", -50)}>-50 trophies</button>
          <button onClick={() => devChange("dev-tokens", 100)}>+100 tokens</button>
          <button onClick={() => devChange("dev-tokens", 1000)}>+1000 tokens</button>
          <button onClick={() => devChange("dev-tokens", -100)}>-100 tokens</button>
          <button onClick={() => devChange("dev-reset-bonus")}>Reset daily bonus</button>
        </div>
      )}

      {status && <p className="error">{status}</p>}

      <div className="ticket-list">
        {modes.map((m) => {
          const short = user.tokens < m.entry_fee;
          const progress = Math.min(100, Math.round((user.best_trophies / m.unlock_trophies) * 100));
          return (
            <article key={m.slug} className={m.unlocked ? "ticket" : "ticket locked"}>
              <div className="ticket-main">
                <h3>{m.name}</h3>
                <p style={{ margin: 0 }}>{m.description}</p>
                <dl className="ticket-facts">
                  <div>
                    <dt>Pool</dt>
                    <dd>{poolText(m)}</dd>
                  </div>
                  <div>
                    <dt>Cards</dt>
                    <dd className="tiers">
                      {m.allowed_tiers.map((t) => (
                        <span key={t} className={`tier-dot ${t}`}>
                          {t}
                        </span>
                      ))}
                    </dd>
                  </div>
                  <div>
                    <dt>Lineup cap</dt>
                    <dd>{m.budget}</dd>
                  </div>
                </dl>
                <p className="payout">
                  <span className="w">Win: +{m.win_trophies} trophies and {m.entry_fee * 2} tokens back</span>
                  {" · "}
                  <span className="l">Loss: -{m.loss_trophies} trophies and your entry</span>
                </p>
              </div>
              <div className="ticket-stub">
                <div>
                  <div className="fee">{m.entry_fee}</div>
                  <div className="fee-label">tokens to enter</div>
                </div>
                {m.unlocked ? (
                  <button className="btn-primary" onClick={() => startDraft(m.slug)}>
                    Enter
                  </button>
                ) : (
                  <div style={{ width: "100%" }}>
                    <div className="meter" aria-hidden="true">
                      <div className="meter-fill" style={{ width: `${progress}%` }} />
                    </div>
                    <div className="lock-note">
                      {m.unlock_trophies - user.best_trophies} more trophies to unlock
                    </div>
                  </div>
                )}
                {m.unlocked && short && <div className="lock-note">You have {user.tokens} tokens</div>}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}