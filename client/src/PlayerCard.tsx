import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export type Card = {
  player_id: string;
  name: string;
  position: string;
  position_group: string;
  team: string;
  headshot_url: string | null;
  games: number;
  passing_yards: number;
  passing_tds: number;
  rushing_yards: number;
  rushing_tds: number;
  receptions: number;
  receiving_yards: number;
  receiving_tds: number;
  def_tackles_solo: number;
  def_tackle_assists: number;
  def_tackles_for_loss: number;
  def_sacks: number;
  def_qb_hits: number;
  def_interceptions: number;
  def_pass_defended: number;
  def_fumbles_forced: number;
  def_tds: number;
  fg_made: number;
  fg_att: number;
  fg_long: number;
  pat_made: number;
  fantasy_points: number;
  tokens: number;
  tier: "elite" | "gold" | "silver" | "bronze";
};

// Three key stats, chosen by card type
function keyStats(c: Card): string[] {
  const tackles = c.def_tackles_solo + c.def_tackle_assists;
  switch (c.position_group) {
    case "QB":
      return [`${c.passing_yards} pass yds`, `${c.passing_tds} pass TD`, `${c.rushing_yards} rush yds`];
    case "RB":
      return [`${c.rushing_yards} rush yds`, `${c.rushing_tds} rush TD`, `${c.receptions} rec`];
    case "WR":
    case "TE":
      return [`${c.receptions} rec`, `${c.receiving_yards} rec yds`, `${c.receiving_tds} rec TD`];
    case "K":
      return [`${c.fg_made}/${c.fg_att} FG`, `${c.fg_long} yd long`, `${c.pat_made} XP`];
    case "DL":
      return [`${c.def_sacks} sacks`, `${tackles} tackles`, `${c.def_qb_hits} QB hits`];
    case "LB":
      return [`${tackles} tackles`, `${c.def_tackles_for_loss} TFL`, `${c.def_sacks} sacks`];
    case "DB":
      return [`${c.def_interceptions} INT`, `${c.def_pass_defended} pass def`, `${tackles} tackles`];
    default:
      return [];
  }
}

// The printed card itself. Used on the table and again, larger, in the zoom view.
function CardFace({ card, zoomButton }: { card: Card; zoomButton?: React.ReactNode }) {
  const [imgFailed, setImgFailed] = useState(false);
  const initials = card.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2);

  return (
    <>
      <div className="pcard-top">
        <span className="pcard-pos">{card.position}</span>
        <span className="pcard-cost" title="Cap cost">
          {card.tokens}
          <small>cap</small>
        </span>
      </div>

      {card.headshot_url && !imgFailed ? (
        <img
          className="pcard-photo"
          src={card.headshot_url}
          alt={card.name}
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <div className="pcard-photo pcard-initials">{initials}</div>
      )}

      <div className="pcard-name">{card.name}</div>
      <div className="pcard-team">
        {card.team} · {card.games} games
      </div>
      <div className="pcard-stats">
        {keyStats(card).map((s) => (
          <div key={s}>{s}</div>
        ))}
      </div>
      <div className="pcard-foot">
        {card.fantasy_points.toFixed(1)} fantasy pts · {card.tier}
      </div>
      {zoomButton}
    </>
  );
}

// A card on the table. Clicking it opens the zoom view when zoomOnClick is on.
// The zoom button always opens it, even where the card body is used for something else.
export default function PlayerCard({ card, zoomOnClick = true }: { card: Card; zoomOnClick?: boolean }) {
  const [zoomed, setZoomed] = useState(false);

  useEffect(() => {
    if (!zoomed) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setZoomed(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomed]);

  function open(e: React.MouseEvent) {
    e.stopPropagation();
    setZoomed(true);
  }

  return (
    <>
      <div
        className={`pcard ${card.tier} ${zoomOnClick ? "zoomable" : ""}`}
        onClick={zoomOnClick ? open : undefined}
      >
        <CardFace
          card={card}
          zoomButton={
            <button type="button" className="pcard-zoom" onClick={open} aria-label={`Zoom in on ${card.name}`}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          }
        />
      </div>

      {zoomed &&
        createPortal(
          <div
            className="zoom-backdrop"
            role="dialog"
            aria-modal="true"
            aria-label={card.name}
            onClick={(e) => {
              e.stopPropagation();
              setZoomed(false);
            }}
          >
            <div className="zoom-stage" onClick={(e) => e.stopPropagation()}>
              <div className={`zoom-aura ${card.tier}`} aria-hidden="true" />
              <div className={`pcard big ${card.tier}`}>
                <CardFace card={card} />
              </div>
              <button type="button" className="zoom-close" onClick={() => setZoomed(false)}>
                Close
              </button>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
