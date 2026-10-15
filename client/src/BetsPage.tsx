import { useCallback, useEffect, useState } from "react";
import { useAuth } from "./auth";
import { CoinIcon } from "./Icons";

type Snap = {
  name: string;
  position: string;
  team: string;
  season: number;
  headshot_url: string | null;
  points: number;
};
type Selection = { key: string; label: string; odds: number };
type Offer = {
  id: number;
  kind: "h2h" | "over_under";
  title: string;
  cards: Snap[];
  line?: number;
  selections: Selection[];
};
type Leg = {
  kind: "h2h" | "over_under";
  title: string;
  cards: Snap[];
  line: number | null;
  pick: string;
  odds: number;
  outcome: "won" | "lost" | "push";
  scores: number[];
};
type Bet = {
  id: number;
  stake: number;
  odds: number;
  status: "won" | "lost" | "push";
  payout: number;
  legs: Leg[];
};

const MAX_LEGS = 4;

function MiniPlayer({ card, score, win }: { card: Snap; score?: number; win?: boolean }) {
  const [failed, setFailed] = useState(false);
  const initials = card.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2);
  return (
    <div className="mini">
      {card.headshot_url && !failed ? (
        <img src={card.headshot_url} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
      ) : (
        <span className="mini-initials">{initials}</span>
      )}
      <div className="mini-text">
        <strong>{card.name}</strong>
        <span className="muted">
          {card.position} · {card.team} {card.season} · {card.points.toFixed(1)} season pts
        </span>
      </div>
      {score !== undefined && <span className={win ? "mini-score win" : "mini-score"}>{score}</span>}
    </div>
  );
}

export default function BetsPage() {
  const { user, refresh } = useAuth();
  const [offers, setOffers] = useState<Offer[]>([]);
  const [history, setHistory] = useState<Bet[]>([]);
  const [slip, setSlip] = useState<Record<number, string>>({}); // offer id -> chosen selection key
  const [stake, setStake] = useState("10");
  const [result, setResult] = useState<Bet | null>(null);
  const [status, setStatus] = useState("Loading...");
  const [busy, setBusy] = useState(false);

  const apply = useCallback((d: any) => {
    if (Array.isArray(d.offers)) {
      setOffers(d.offers);
      setHistory(d.bets ?? []);
      setSlip({});
      setStatus("");
    } else {
      setStatus(d.error ?? "Could not load the bets.");
    }
  }, []);

  const load = useCallback(() => {
    fetch("/api/bets/slate")
      .then((r) => r.json())
      .then(apply)
      .catch(() => setStatus("Could not reach the server."));
  }, [apply]);

  useEffect(() => {
    load();
  }, [load]);

  async function refreshBoard() {
    setStatus("");
    try {
      const res = await fetch("/api/bets/slate/refresh", { method: "POST" });
      apply(await res.json());
    } catch {
      setStatus("Could not reach the server.");
    }
  }

  function toggle(offerId: number, key: string) {
    const next = { ...slip };
    if (next[offerId] === key) delete next[offerId];
    else if (next[offerId] || Object.keys(next).length < MAX_LEGS) next[offerId] = key;
    else return;
    setSlip(next);
  }

  const picked = offers.filter((o) => slip[o.id]);
  const combined = picked.reduce((product, o) => product * o.selections.find((s) => s.key === slip[o.id])!.odds, 1);
  const odds = Math.round(combined * 100) / 100;
  const stakeNumber = Math.floor(Number(stake));
  const validStake = Number.isFinite(stakeNumber) && stakeNumber >= 1;
  const payout = validStake ? Math.floor(stakeNumber * odds) : 0;
  const tooMuch = !!user && validStake && stakeNumber > user.tokens;

  async function place() {
    if (!validStake || picked.length === 0) return;
    setBusy(true);
    setStatus("");
    try {
      const res = await fetch("/api/bets/place", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stake: stakeNumber,
          picks: picked.map((o) => ({ offer_id: o.id, selection: slip[o.id] })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus(data.error ?? "Could not place the bet.");
        if (res.status === 409) load();
      } else {
        setResult(data.bet);
        await refresh(); // update the tokens in the top bar
      }
    } catch {
      setStatus("Could not reach the server.");
    }
    setBusy(false);
  }

  if (!user) return null;

  // The result of a bet that was just placed
  if (result) {
    const net = result.payout - result.stake;
    const headline = result.status === "won" ? "Bet won" : result.status === "lost" ? "Bet lost" : "Bet pushed";
    return (
      <div>
        <section className="scoreboard" aria-label="Bet result">
          <div className="sb-title">
            <span>{result.legs.length > 1 ? `${result.legs.length}-pick parlay` : "Single bet"}</span>
            <span>
              {result.stake} tokens at {result.odds.toFixed(2)}x
            </span>
          </div>
          <div style={{ textAlign: "center" }}>
            <div className={`sb-verdict ${result.status === "won" ? "win" : result.status === "lost" ? "loss" : "draw"}`}>
              {headline}
            </div>
            <div className={`delta ${net > 0 ? "up" : net < 0 ? "down" : "flat"}`} style={{ justifyContent: "center", marginTop: 12 }}>
              <CoinIcon />
              {net > 0 ? `+${net}` : net}
            </div>
          </div>
        </section>

        <div className="legs">
          {result.legs.map((leg, i) => (
            <article key={i} className={`leg ${leg.outcome}`}>
              <div className="leg-head">
                <span className="leg-outcome">{leg.outcome === "won" ? "Won" : leg.outcome === "lost" ? "Lost" : "Push"}</span>
                <span>
                  You picked <strong>{leg.pick}</strong> at {leg.odds.toFixed(2)}x
                </span>
              </div>
              {leg.kind === "h2h" ? (
                <>
                  <MiniPlayer card={leg.cards[0]} score={leg.scores[0]} win={leg.scores[0] > leg.scores[1]} />
                  <MiniPlayer card={leg.cards[1]} score={leg.scores[1]} win={leg.scores[1] > leg.scores[0]} />
                </>
              ) : (
                <>
                  <MiniPlayer card={leg.cards[0]} score={leg.scores[0]} />
                  <p className="muted" style={{ margin: "6px 0 0" }}>
                    Line was {leg.line}
                  </p>
                </>
              )}
            </article>
          ))}
        </div>

        <p style={{ marginTop: 18 }}>
          <button
            className="btn-primary"
            onClick={() => {
              setResult(null);
              load();
            }}
          >
            Back to the board
          </button>
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1>Bets</h1>
      <p className="muted">
        Bet tokens on how cards score on game day. Each card scores its season total times a random 80% to 120%.
        Pick one bet, or combine up to {MAX_LEGS} into a parlay: every pick must win, and the odds multiply. The
        house keeps about 8%, so winning takes judgment and luck.
      </p>
      {status && <p className="error">{status}</p>}

      <div className="bets-layout">
        <div>
          <div className="board-head">
            <h2 style={{ margin: 0 }}>On the board</h2>
            <button className="btn-small" onClick={refreshBoard}>
              New board
            </button>
          </div>

          <div className="offers">
            {offers.map((o) => (
              <article key={o.id} className="offer">
                <div className="offer-kind muted">{o.kind === "h2h" ? "Head to head" : "Over or under"}</div>
                <h3>{o.title}</h3>
                {o.cards.map((c, i) => (
                  <MiniPlayer key={i} card={c} />
                ))}
                <div className="sels">
                  {o.selections.map((s) => (
                    <button
                      key={s.key}
                      className={slip[o.id] === s.key ? "sel chosen" : "sel"}
                      onClick={() => toggle(o.id, s.key)}
                      aria-pressed={slip[o.id] === s.key}
                    >
                      <span className="sel-label">{s.label}</span>
                      <span className="sel-odds">{s.odds.toFixed(2)}x</span>
                    </button>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>

        <aside className="slip">
          <h2>Your bet</h2>
          {picked.length === 0 ? (
            <p className="muted">Choose a side on the board to start a bet.</p>
          ) : (
            <>
              <ul className="slip-list">
                {picked.map((o) => {
                  const s = o.selections.find((x) => x.key === slip[o.id])!;
                  return (
                    <li key={o.id}>
                      <span>
                        <strong>{s.label}</strong>
                        <span className="muted"> {o.kind === "h2h" ? "to outscore" : o.cards[0].name}</span>
                      </span>
                      <span className="slip-odds">{s.odds.toFixed(2)}x</span>
                    </li>
                  );
                })}
              </ul>
              <div className="slip-total">
                <span>{picked.length > 1 ? `Parlay odds (${picked.length} picks)` : "Odds"}</span>
                <strong>{odds.toFixed(2)}x</strong>
              </div>

              <label className="muted" htmlFor="stake">
                Tokens to bet
              </label>
              <input
                id="stake"
                type="number"
                min={1}
                step={1}
                inputMode="numeric"
                value={stake}
                onChange={(e) => setStake(e.target.value)}
              />
              <div className="quick">
                {[10, 50, 100].map((n) => (
                  <button key={n} className="btn-small" onClick={() => setStake(String(n))}>
                    {n}
                  </button>
                ))}
                <button className="btn-small" onClick={() => setStake(String(user.tokens))}>
                  All in
                </button>
              </div>

              <div className="slip-total">
                <span>A win pays</span>
                <strong>{payout.toLocaleString()}</strong>
              </div>
              {tooMuch && <p className="error">You only have {user.tokens.toLocaleString()} tokens.</p>}
              <button className="btn-primary" style={{ width: "100%" }} onClick={place} disabled={busy || !validStake || tooMuch}>
                {busy ? "Playing..." : `Place ${validStake ? stakeNumber.toLocaleString() : ""} token bet`}
              </button>
            </>
          )}
        </aside>
      </div>

      {history.length > 0 && (
        <section style={{ marginTop: 28 }}>
          <h2>Recent bets</h2>
          <ul className="history">
            {history.map((b) => {
              const net = b.payout - b.stake;
              return (
                <li key={b.id}>
                  <span className={`hist-status ${b.status}`}>{b.status === "won" ? "Won" : b.status === "lost" ? "Lost" : "Push"}</span>
                  <span>
                    {b.legs.length > 1 ? `${b.legs.length}-pick parlay` : b.legs[0].pick} · {b.stake} at {b.odds.toFixed(2)}x
                  </span>
                  <strong className={net > 0 ? "up" : net < 0 ? "down" : "flat"}>{net > 0 ? `+${net}` : net}</strong>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}