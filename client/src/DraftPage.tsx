import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import PlayerCard from "./PlayerCard";
import type { Card } from "./PlayerCard";

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

type DraftCard = Card & { season: number; slot: string | null };

type Draft = {
  id: number;
  status: "open" | "submitted";
  season: number | null;
  total_cost: number | null;
  mode_name: string;
  budget: number;
};

export default function DraftPage() {
  const { id } = useParams();
  const [draft, setDraft] = useState<Draft | null>(null);
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

  if (!draft) return <p>{status}</p>;

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
      else load();
    } catch {
      setStatus("Could not reach the server.");
    }
    setSaving(false);
  }

  const seasonLabel = draft.season ? `${draft.season} season` : "multiple seasons";

  // After submitting, show the saved lineup
  if (submitted) {
    return (
      <div>
        <h1>{draft.mode_name}: lineup saved</h1>
        <p>
          Spent {draft.total_cost} of {draft.budget} tokens.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
          {SLOTS.map((s) => {
            const c = picks[s.slot];
            return c ? (
              <div key={s.slot} style={{ textAlign: "center" }}>
                <strong>{s.slot}</strong> · {c.season}
                <PlayerCard card={c} />
              </div>
            ) : null;
          })}
        </div>
        <p>
          <Link to="/modes">Back to game modes</Link>
        </p>
      </div>
    );
  }

  const candidates = cards.filter((c) => c.position_group === activeGroup);

  return (
    <div>
      <h1>{draft.mode_name}</h1>
      <p>
        {seasonLabel} · Budget: <strong>{spent}</strong> / {draft.budget} tokens ({remaining} left)
        {neededForEmpty > 0 && ` · Empty slots need at least ${neededForEmpty}`}
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
        {SLOTS.map((s) => {
          const p = picks[s.slot];
          const active = s.slot === activeSlot;
          return (
            <button
              key={s.slot}
              onClick={() => setActiveSlot(s.slot)}
              style={{
                padding: "6px 10px",
                border: active ? "3px solid #1565c0" : "1px solid #999",
                borderRadius: 8,
                minWidth: 110,
                textAlign: "left",
              }}
            >
              <div style={{ fontWeight: "bold" }}>{s.slot}</div>
              <div style={{ fontSize: 12 }}>{p ? `${p.name} (${p.tokens})` : "empty"}</div>
            </button>
          );
        })}
      </div>

      <button onClick={submit} disabled={!allFilled || remaining < 0 || saving}>
        {saving ? "Saving..." : "Submit lineup"}
      </button>
      {!allFilled && <span style={{ marginLeft: 8 }}>Fill all 9 slots to submit.</span>}
      {status && <p style={{ color: "crimson" }}>{status}</p>}

      <h3>Choose your {activeSlot}</h3>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
        {candidates.map((c) => {
          const chosen = picks[activeSlot]?.player_id === c.player_id && picks[activeSlot]?.season === c.season;
          const ok = chosen || canPick(c);
          return (
            <div
              key={`${c.player_id}-${c.season}`}
              onClick={() => choose(c)}
              style={{
                cursor: ok ? "pointer" : "not-allowed",
                opacity: ok ? 1 : 0.35,
                outline: chosen ? "4px solid #1565c0" : "none",
                borderRadius: 16,
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: 13 }}>{c.season}</div>
              <PlayerCard card={c} />
            </div>
          );
        })}
      </div>
    </div>
  );
}