import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useAuth } from "./auth";
import { CoinIcon } from "./Icons";
import { useToast } from "./Toast";
import { useCountUp } from "./useCountUp";

type Mode = { slug: string; name: string; description: string; unlocked: boolean; budget: number; allowed_tiers: string[] };

// Pick a game mode and a wager, then start drafting
export function NewChallengePage() {
  const { friendId } = useParams();
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [friendName, setFriendName] = useState("");
  const [modes, setModes] = useState<Mode[]>([]);
  const [slug, setSlug] = useState("");
  const [wager, setWager] = useState("0");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/friends")
      .then((r) => r.json())
      .then((d) => setFriendName(d.friends?.find((f: any) => String(f.id) === friendId)?.display_name ?? ""))
      .catch(() => {});
    fetch("/api/modes")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.modes)) {
          const open = d.modes.filter((m: Mode) => m.unlocked);
          setModes(open);
          if (open[0]) setSlug(open[0].slug);
        }
      })
      .catch(() => setStatus("Could not reach the server."));
  }, [friendId]);

  const wagerNumber = Math.floor(Number(wager));
  const validWager = Number.isFinite(wagerNumber) && wagerNumber >= 0;
  const tooMuch = !!user && validWager && wagerNumber > user.tokens;

  async function start() {
    setBusy(true);
    setStatus("");
    try {
      const res = await fetch("/api/challenges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ friendId: Number(friendId), modeSlug: slug, wager: wagerNumber }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setStatus(data.error ?? "Could not start the challenge.");
      else {
        await refresh(); // the wager is held right away
        toast("Challenge started. Draft your lineup first.", "good");
        navigate(`/draft/${data.draft_id}`);
      }
    } catch {
      setStatus("Could not reach the server.");
    }
    setBusy(false);
  }

  if (!user) return null;

  return (
    <div>
      <h1>Challenge {friendName || "a friend"}</h1>
      <p className="muted">
        You draft first from a random pool. Then your friend gets the same pool, drafts their own lineup, and the
        two lineups play. The winner takes both wagers. Trophies do not change in friend matches.
      </p>

      <h2>Game mode</h2>
      <div className="choices">
        {modes.map((m) => (
          <button key={m.slug} className={slug === m.slug ? "choice chosen" : "choice"} onClick={() => setSlug(m.slug)} aria-pressed={slug === m.slug}>
            <strong>{m.name}</strong>
            <span className="muted">Lineup cap {m.budget} · {m.allowed_tiers.join(", ")}</span>
          </button>
        ))}
      </div>
      <p className="muted">Both of you need to have unlocked the mode.</p>

      <h2>Wager</h2>
      <div className="chip-row">
        {[0, 10, 50, 100, 250].map((n) => (
          <button key={n} className={wagerNumber === n ? "btn-small chip chosen" : "btn-small chip"} onClick={() => setWager(String(n))}>
            {n === 0 ? "Friendly" : `${n} tokens`}
          </button>
        ))}
        <input
          type="number"
          min={0}
          step={1}
          value={wager}
          onChange={(e) => setWager(e.target.value)}
          aria-label="Custom wager in tokens"
          style={{ width: 120 }}
        />
      </div>
      <p className="muted">
        You have {user.tokens.toLocaleString()} tokens. Your wager is held until the match ends.
      </p>
      {tooMuch && <p className="error">That is more tokens than you have.</p>}
      {status && <p className="error">{status}</p>}
      <button className="btn-primary" onClick={start} disabled={busy || !slug || !validWager || tooMuch}>
        {busy ? "Starting..." : "Start challenge and draft"}
      </button>{" "}
      <Link to="/friends" className="btn">
        Back
      </Link>
    </div>
  );
}

type SideCard = { name: string; team: string; season: number; score: number };
type Challenge = {
  id: number;
  status: "drafting" | "invited" | "accepted" | "complete" | "declined" | "cancelled";
  wager: number;
  mode_name: string;
  challenger_id: number;
  opponent_id: number;
  challenger_name: string;
  opponent_name: string;
  winner_id: number | null;
  challenger_total: number | null;
  opponent_total: number | null;
  my_draft_id: number | null;
  slots: { slot: string; challenger: SideCard; opponent: SideCard }[] | null;
};

export function ChallengePage() {
  const { id } = useParams();
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [c, setC] = useState<Challenge | null>(null);
  const [status, setStatus] = useState("Loading...");
  const lastStatus = useRef("");

  const load = useCallback(() => {
    fetch(`/api/challenges/${id}`)
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!ok) {
          setStatus(d.error ?? "Could not load the challenge.");
          return;
        }
        setC(d);
        setStatus("");
        if (d.status === "complete" && lastStatus.current !== "complete") refresh(); // winnings arrived
        lastStatus.current = d.status;
      })
      .catch(() => setStatus("Could not reach the server."));
  }, [id, refresh]);

  useEffect(() => {
    load();
    const timer = setInterval(() => {
      if (lastStatus.current !== "complete") load();
    }, 6000);
    return () => clearInterval(timer);
  }, [load]);

  async function call(action: "accept" | "decline" | "cancel") {
    const res = await fetch(`/api/challenges/${id}/${action}`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast(data.error ?? "Something went wrong.", "bad");
      return;
    }
    await refresh();
    window.dispatchEvent(new Event("social-changed"));
    if (action === "accept") navigate(`/draft/${data.draft_id}`);
    else {
      toast(action === "decline" ? "Challenge declined" : "Challenge cancelled", "good");
      navigate("/friends");
    }
  }

  // Hooks must run on every render, so the scoreboard numbers are set up before any early return
  const mine = !!c && !!user && c.challenger_id === user.id;
  const myTotal = c ? (mine ? c.challenger_total : c.opponent_total) ?? 0 : 0;
  const theirTotal = c ? (mine ? c.opponent_total : c.challenger_total) ?? 0 : 0;
  const you = useCountUp(myTotal);
  const them = useCountUp(theirTotal);

  if (!user) return null;
  if (!c) return <p className="muted">{status}</p>;

  const otherName = mine ? c.opponent_name : c.challenger_name;
  const now = c.status === "drafting" ? 0 : c.status === "invited" ? 1 : c.status === "accepted" ? 2 : 3;
  const stepLabels = [`${c.challenger_name} drafts`, `${c.opponent_name} accepts`, `${c.opponent_name} drafts`, "Match played"];
  const result = c.winner_id === null ? "draw" : c.winner_id === user.id ? "win" : "loss";
  const net = c.wager === 0 || result === "draw" ? 0 : result === "win" ? c.wager : -c.wager;

  return (
    <div>
      <h1>
        You vs {otherName}
      </h1>
      <p className="muted">
        {c.mode_name} · {c.wager > 0 ? `${c.wager} token wager each, winner takes ${c.wager * 2}` : "Friendly match, no wager"}
      </p>

      {c.status !== "declined" && c.status !== "cancelled" && (
        <ol className="steps" aria-label="Challenge progress">
          {stepLabels.map((label, i) => (
            <li key={label} className={c.status === "complete" || i < now ? "done" : i === now ? "now" : ""}>
              {label}
            </li>
          ))}
        </ol>
      )}

      {c.status === "complete" && c.slots && (
        <>
          <section className="scoreboard" aria-label="Final score">
            <div className="sb-title">
              <span>{c.mode_name}</span>
              <span>vs {otherName}</span>
            </div>
            <div className="sb-grid">
              <div>
                <div className="sb-team">You</div>
                <div className={result === "loss" ? "sb-num dim" : "sb-num"}>{you.toFixed(1)}</div>
              </div>
              <div className={`sb-verdict ${result}`}>{result === "win" ? "Win" : result === "loss" ? "Loss" : "Draw"}</div>
              <div>
                <div className="sb-team">{otherName}</div>
                <div className={result === "win" ? "sb-num dim" : "sb-num"}>{them.toFixed(1)}</div>
              </div>
            </div>
            {c.wager > 0 && (
              <div className="sb-deltas">
                <span className={`delta ${net > 0 ? "up" : net < 0 ? "down" : "flat"}`}>
                  <CoinIcon />
                  {net > 0 ? `+${net}` : net}
                </span>
              </div>
            )}
          </section>
          <div className="tablewrap">
            <table className="plays">
              <thead>
                <tr>
                  <th>Slot</th>
                  <th>You</th>
                  <th>Pts</th>
                  <th>{otherName}</th>
                  <th>Pts</th>
                </tr>
              </thead>
              <tbody>
                {c.slots.map((s) => {
                  const a = mine ? s.challenger : s.opponent;
                  const b = mine ? s.opponent : s.challenger;
                  return (
                    <tr key={s.slot}>
                      <td className="slotcol">{s.slot}</td>
                      <td>
                        {a.name}
                        <span className="sub">
                          {a.team} {a.season}
                        </span>
                      </td>
                      <td className={a.score > b.score ? "pts best" : "pts"}>{a.score}</td>
                      <td>
                        {b.name}
                        <span className="sub">
                          {b.team} {b.season}
                        </span>
                      </td>
                      <td className={b.score > a.score ? "pts best" : "pts"}>{b.score}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="muted" style={{ marginTop: 12 }}>
            On game day each card scores between 80% and 120% of its season total. Both of you drafted from the same pool.
          </p>
        </>
      )}

      {c.status === "drafting" && mine && (
        <p>
          <Link to={`/draft/${c.my_draft_id}`} className="btn btn-primary">
            Finish your lineup
          </Link>{" "}
          <button onClick={() => call("cancel")}>Cancel challenge</button>
        </p>
      )}
      {c.status === "invited" && mine && (
        <>
          <p>Waiting for {c.opponent_name} to accept. Your lineup is locked in and hidden until the match is played.</p>
          <button onClick={() => call("cancel")}>Cancel and get your wager back</button>
        </>
      )}
      {c.status === "invited" && !mine && (
        <>
          <p>
            {c.challenger_name} has drafted a lineup and challenged you. Accept to get the same pool and draft your own.
            {c.wager > 0 && ` Accepting puts ${c.wager} of your tokens on the line.`}
          </p>
          <button className="btn-primary" onClick={() => call("accept")}>
            Accept and draft
          </button>{" "}
          <button onClick={() => call("decline")}>Decline</button>
        </>
      )}
      {c.status === "accepted" && !mine && c.my_draft_id && (
        <p>
          <Link to={`/draft/${c.my_draft_id}`} className="btn btn-primary">
            Draft your lineup
          </Link>
        </p>
      )}
      {c.status === "accepted" && mine && (
        <>
          <p>{c.opponent_name} is drafting. You will see the result here when they lock in their lineup.</p>
          <button onClick={() => call("cancel")}>Cancel (after 24 hours of waiting)</button>
        </>
      )}
      {(c.status === "declined" || c.status === "cancelled") && <p className="muted">This challenge was {c.status}. Any wager was returned.</p>}

      <p style={{ marginTop: 18 }}>
        <Link to="/friends">Back to friends</Link>
      </p>
    </div>
  );
}