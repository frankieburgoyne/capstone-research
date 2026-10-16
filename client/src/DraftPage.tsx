import { useCallback, useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router";
import { useAuth } from "./auth";
import { CoinIcon, TrophyIcon } from "./Icons";
import PlayerCard from "./PlayerCard";
import type { Card } from "./PlayerCard";
import { useCountUp } from "./useCountUp";

// The 9 lineup slots and which card type fits each one
const SLOTS = [
  { slot: "QB", group: "QB" },
  { slot: "RB", group: "RB" },
  { slot: "WR1", group: "WR" },
  { slot: "WR2", group: "WR" },
  { slot: "TE", group: "TE" },
  { slot: "K", group: "K" },
  { slot: "DL", group: "DL" },
  { slot: "LB", group: "LB" },
  { slot: "DB", group: "DB" },
];

// Where each slot sits on the field, as percentages (x across, y down).
// Defense across the top, offense across the bottom, kicker on the sideline.
const FIELD_POS: Record<string, [number, number]> = {
  DL: [28, 20],
  LB: [50, 20],
  DB: [72, 20],
  WR1: [14, 56],
  TE: [74, 66],
  WR2: [86, 56],
  QB: [50, 62],
  RB: [50, 84],
  K: [88, 86],
};

type DraftCard = Card & { season: number; slot: string | null };

type SlotCard = {
  name: string;
  position: string;
  team: string;
  season: number;
  tier: string;
  fantasy_points: number;
  score: number;
};

type Match = {
  result: "win" | "loss" | "draw";
  opponent_name: string;
  user_total: number;
  cpu_total: number;
  trophy_delta: number;
  token_delta: number;
  slots: { slot: string; you: SlotCard; cpu: SlotCard }[];
};

type Draft = {
  id: number;
  status: "open" | "submitted";
  season: number | null;
  total_cost: number | null;
  mode_name: string;
  budget: number;
  challenge_id: number | null;
};

function Scoreboard({ match, modeName }: { match: Match; modeName: string }) {
  const you = useCountUp(match.user_total);
  const cpu = useCountUp(match.cpu_total);
  const verdict = match.result === "win" ? "Win" : match.result === "loss" ? "Loss" : "Draw";
  const sign = (n: number) => (n > 0 ? `+${n}` : `${n}`);
  const cls = (n: number) => (n > 0 ? "up" : n < 0 ? "down" : "flat");
  return (
    <section className="scoreboard" aria-label="Final score">
      <div className="sb-title">
        <span>{modeName}</span>
        <span>vs {match.opponent_name}</span>
      </div>
      <div className="sb-grid">
        <div>
          <div className="sb-team">You</div>
          <div className={match.result === "loss" ? "sb-num dim" : "sb-num"}>{you.toFixed(1)}</div>
        </div>
        <div className={`sb-verdict ${match.result}`}>{verdict}</div>
        <div>
          <div className="sb-team">{match.opponent_name}</div>
          <div className={match.result === "win" ? "sb-num dim" : "sb-num"}>{cpu.toFixed(1)}</div>
        </div>
      </div>
      <div className="sb-deltas">
        <span className={`delta ${cls(match.trophy_delta)}`} title="Trophies">
          <TrophyIcon />
          {sign(match.trophy_delta)}
        </span>
        <span className={`delta ${cls(match.token_delta)}`} title="Tokens (after your entry fee)">
          <CoinIcon />
          {sign(match.token_delta)}
        </span>
      </div>
    </section>
  );
}

export default function DraftPage() {
  const { id } = useParams();
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [match, setMatch] = useState<Match | null>(null);
  const [cards, setCards] = useState<DraftCard[]>([]);
  const [picks, setPicks] = useState<Record<string, DraftCard>>({});
  const [activeSlot, setActiveSlot] = useState("QB");
  const [status, setStatus] = useState("Loading...");
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/drafts/${id}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.draft) {
          setDraft(d.draft);
          setCards(d.cards);
          setMatch(d.match ?? null);
          // A submitted draft shows its saved lineup
          const saved: Record<string, DraftCard> = {};
          for (const c of d.cards as DraftCard[]) if (c.slot) saved[c.slot] = c;
          setPicks(saved);
          setStatus("");
        } else {
          setStatus(d.error ?? "Could not load the draft.");
        }
      })
      .catch(() => setStatus("Could not reach the server."));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (!draft) return <p className="muted">{status}</p>;

  const submitted = draft.status === "submitted";
  const spent = Object.values(picks).reduce((sum, c) => sum + c.tokens, 0);
  const remaining = draft.budget - spent;
  const activeGroup = SLOTS.find((s) => s.slot === activeSlot)!.group;

  // The least the still-empty slots could cost, so you do not spend yourself into a corner
  const usedPlayers = new Set(Object.values(picks).map((c) => c.player_id));
  let neededForEmpty = 0;
  const emptyByGroup: Record<string, number> = {};
  for (const s of SLOTS) if (!picks[s.slot]) emptyByGroup[s.group] = (emptyByGroup[s.group] ?? 0) + 1;
  for (const [group, count] of Object.entries(emptyByGroup)) {
    const costs = cards
      .filter((c) => c.position_group === group && !usedPlayers.has(c.player_id))
      .map((c) => c.tokens)
      .sort((a, b) => a - b);
    for (let i = 0; i < count; i++) neededForEmpty += costs[i] ?? 0;
  }

  const allFilled = SLOTS.every((s) => picks[s.slot]);

  function canPick(c: DraftCard): boolean {
    const takenElsewhere = Object.entries(picks).some(
      ([slot, p]) => slot !== activeSlot && p.player_id === c.player_id
    );
    if (takenElsewhere) return false;
    const spentWithoutThisSlot = spent - (picks[activeSlot]?.tokens ?? 0);
    return spentWithoutThisSlot + c.tokens <= draft!.budget;
  }

  function choose(c: DraftCard) {
    const current = picks[activeSlot];
    if (current && current.player_id === c.player_id && current.season === c.season) {
      // Clicking the chosen card again removes it
      const next = { ...picks };
      delete next[activeSlot];
      setPicks(next);
      return;
    }
    if (!canPick(c)) return;
    setPicks({ ...picks, [activeSlot]: c });
    // Jump to the next empty slot
    const next = SLOTS.find((s) => s.slot !== activeSlot && !picks[s.slot]);
    if (next) setActiveSlot(next.slot);
  }

  async function submit() {
    setSaving(true);
    setStatus("");
    const body: Record<string, { player_id: string; season: number }> = {};
    for (const s of SLOTS) {
      const p = picks[s.slot];
      if (p) body[s.slot] = { player_id: p.player_id, season: p.season };
    }
    try {
      const res = await fetch(`/api/drafts/${id}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ picks: body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setStatus(data.error ?? "Could not save the lineup.");
      else {
        await refresh(); // update the trophies and tokens in the top bar
        if (data.challenge_id) navigate(`/challenges/${data.challenge_id}`);
        else load();
      }
    } catch {
      setStatus("Could not reach the server.");
    }
    setSaving(false);
  }

  const seasonLabel = draft.season ? `${draft.season} season` : "multiple seasons";

  // A lineup for a friend challenge is finished: the challenge page shows what happens next
  if (submitted && draft.challenge_id) return <Navigate to={`/challenges/${draft.challenge_id}`} replace />;

  // After submitting, show the matchup result
  if (submitted && match) {
    return (
      <div>
        <Scoreboard match={match} modeName={draft.mode_name} />

        <h3>Play by play</h3>
        <div className="tablewrap">
          <table className="plays">
            <thead>
              <tr>
                <th>Slot</th>
                <th>Your card</th>
                <th>Pts</th>
                <th>{match.opponent_name}</th>
                <th>Pts</th>
              </tr>
            </thead>
            <tbody>
              {match.slots.map((s) => (
                <tr key={s.slot}>
                  <td className="slotcol">{s.slot}</td>
                  <td>
                    {s.you.name}
                    <span className="sub">
                      {s.you.team} {s.you.season}
                    </span>
                  </td>
                  <td className={s.you.score > s.cpu.score ? "pts best" : "pts"}>{s.you.score}</td>
                  <td>
                    {s.cpu.name}
                    <span className="sub">
                      {s.cpu.team} {s.cpu.season}
                    </span>
                  </td>
                  <td className={s.cpu.score > s.you.score ? "pts best" : "pts"}>{s.cpu.score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ marginTop: 12 }}>
          On game day each card scores between 80% and 120% of its season total.
        </p>
        <Link to="/modes" className="btn btn-primary">
          Back to games
        </Link>
      </div>
    );
  }

  // A lineup that was saved before matchups existed
  if (submitted) {
    return (
      <div>
        <h1>{draft.mode_name}</h1>
        <p className="muted">
          Lineup saved. Spent {draft.total_cost} of {draft.budget} cap.
        </p>
        <div className="saved-lineup">
          {SLOTS.map((s) => {
            const c = picks[s.slot];
            return c ? (
              <div key={s.slot}>
                <div className="pick-year">
                  {s.slot} · {c.season}
                </div>
                <PlayerCard card={c} />
              </div>
            ) : null;
          })}
        </div>
        <p style={{ marginTop: 18 }}>
          <Link to="/modes" className="btn">
            Back to games
          </Link>
        </p>
      </div>
    );
  }

  const candidates = cards.filter((c) => c.position_group === activeGroup);
  const pct = Math.min(100, Math.round((spent / draft.budget) * 100));

  return (
    <div>
      <div className="draft-head">
        <div>
          <h1 style={{ marginBottom: 2 }}>{draft.mode_name}</h1>
          <span className="muted">
            {seasonLabel}
            {draft.challenge_id && " · Friend challenge: your friend drafts from this same pool"}
          </span>
        </div>
        <div className="budget">
          <div className="budget-text">
            <span>
              <strong>{spent}</strong> of {draft.budget} cap used
            </span>
            <span className={remaining < 0 ? "error" : "muted"}>{remaining} left</span>
          </div>
          <div className="meter" aria-hidden="true">
            <div className={remaining < 0 ? "meter-fill over" : "meter-fill"} style={{ width: `${pct}%` }} />
          </div>
          {neededForEmpty > 0 && (
            <div className="muted" style={{ fontSize: "0.85rem", marginTop: 4 }}>
              Empty slots need at least {neededForEmpty}
            </div>
          )}
        </div>
      </div>

      <div className="pitch">
        <div className="field">
          {SLOTS.map((s) => {
            const p = picks[s.slot];
            const cls = ["slot", s.slot === activeSlot ? "active" : "", p ? "filled" : ""].join(" ");
            const [x, y] = FIELD_POS[s.slot];
            return (
              <button
                key={s.slot}
                className={cls}
                style={{ left: `${x}%`, top: `${y}%` }}
                onClick={() => setActiveSlot(s.slot)}
              >
                <div className="slot-name">{s.slot}</div>
                <div className="slot-pick">{p ? `${p.name} (${p.tokens})` : "Empty"}</div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="submit-row">
        <button className="btn-primary" onClick={submit} disabled={!allFilled || remaining < 0 || saving}>
          {saving ? "Saving..." : draft.challenge_id ? "Lock in lineup" : "Lock in lineup and play"}
        </button>
        {!allFilled && <span className="muted">Fill all 9 slots to play.</span>}
      </div>
      {status && <p className="error">{status}</p>}

      <h2 style={{ marginTop: 22 }}>Choose your {activeSlot}</h2>
      <div className="card-grid">
        {candidates.map((c) => {
          const chosen = picks[activeSlot]?.player_id === c.player_id && picks[activeSlot]?.season === c.season;
          const ok = chosen || canPick(c);
          return (
            <div
              key={`${c.player_id}-${c.season}`}
              className={["pick", chosen ? "chosen" : "", ok ? "" : "blocked"].join(" ")}
              onClick={() => choose(c)}
            >
              <div className="pick-year">{c.season}</div>
              <PlayerCard card={c} />
            </div>
          );
        })}
      </div>
    </div>
  );
}