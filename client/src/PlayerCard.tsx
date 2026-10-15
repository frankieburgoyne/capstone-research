import { useState } from "react";

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

const TIER_COLORS: Record<Card["tier"], string> = {
  elite: "#8e44ad",
  gold: "#d4a017",
  silver: "#8a96a3",
  bronze: "#a0643a",
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

export default function PlayerCard({ card }: { card: Card }) {
  const [imgFailed, setImgFailed] = useState(false);
  const color = TIER_COLORS[card.tier];
  const initials = card.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2);

  return (
    <div
      style={{
        width: 190,
        border: `4px solid ${color}`,
        borderRadius: 14,
        padding: 10,
        background: "#fff",
        color: "#111",
        textAlign: "center",
        boxShadow: "0 2px 6px rgba(0,0,0,0.25)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "bold" }}>
        <span>{card.position}</span>
        <span style={{ color }}>{card.tokens} tokens</span>
      </div>

      {card.headshot_url && !imgFailed ? (
        <img
          src={card.headshot_url}
          alt={card.name}
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
          style={{
            display: "block",
            margin: "8px auto",
            width: 120,
            height: 120,
            objectFit: "cover",
            borderRadius: "50%",
            background: "#ddd",
          }}
        />
      ) : (
        <div
          style={{
            margin: "8px auto",
            width: 120,
            height: 120,
            borderRadius: "50%",
            background: color,
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 36,
            fontWeight: "bold",
          }}
        >
          {initials}
        </div>
      )}

      <div style={{ fontWeight: "bold" }}>{card.name}</div>
      <div style={{ fontSize: 13, color: "#555" }}>
        {card.team} · {card.games} games
      </div>
      <div style={{ fontSize: 13, margin: "6px 0" }}>
        {keyStats(card).map((s) => (
          <div key={s}>{s}</div>
        ))}
      </div>
      <div style={{ fontSize: 12, color }}>
        {card.fantasy_points.toFixed(1)} fantasy pts · {card.tier}
      </div>
    </div>
  );
}