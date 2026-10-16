import { useEffect, useState } from "react";
import PlayerCard from "./PlayerCard";
import type { Card } from "./PlayerCard";

const CARD_TYPES = ["QB", "RB", "WR", "TE", "K", "DL", "LB", "DB"];

export default function CardsPage() {
  const [seasons, setSeasons] = useState<number[]>([]);
  const [teams, setTeams] = useState<string[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [season, setSeason] = useState("");
  const [team, setTeam] = useState("");
  const [position, setPosition] = useState("ALL");
  const [status, setStatus] = useState("");

  // Load the season list once
  useEffect(() => {
    fetch("/api/cards/seasons")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d)) setSeasons(d);
        else setStatus(d.error ?? "Could not load seasons.");
      })
      .catch(() => setStatus("Could not reach the server."));
  }, []);

  // When the season changes, load that season's teams
  useEffect(() => {
    setTeams([]);
    setTeam("");
    setCards([]);
    if (!season) return;
    fetch(`/api/cards/teams?season=${season}`)
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d)) setTeams(d);
        else setStatus(d.error ?? "Could not load teams.");
      })
      .catch(() => setStatus("Could not reach the server."));
  }, [season]);

  // When the team changes, load that team's cards
  useEffect(() => {
    setCards([]);
    if (!season || !team) return;
    setStatus("Loading cards...");
    fetch(`/api/cards?season=${season}&team=${team}`)
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d)) {
          setCards(d);
          setStatus(d.length ? "" : "No cards for that team and season.");
        } else {
          setStatus(d.error ?? "Could not load cards.");
        }
      })
      .catch(() => setStatus("Could not reach the server."));
  }, [season, team]);

  const shown = position === "ALL" ? cards : cards.filter((c) => c.position_group === position);

  return (
    <div>
      <header className="hero">
        <h1>Player cards</h1>
        <p>
          Each card is one player in one season. The cap cost (1 to 100) shows how the player ranked
          against everyone at the same position that season.
        </p>
      </header>

      <div className="filters">
        <select value={season} onChange={(e) => setSeason(e.target.value)}>
          <option value="">Choose season</option>
          {seasons.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select value={team} onChange={(e) => setTeam(e.target.value)} disabled={!season}>
          <option value="">Choose team</option>
          {teams.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select value={position} onChange={(e) => setPosition(e.target.value)}>
          <option value="ALL">All positions</option>
          {CARD_TYPES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>

      <p className="muted">{status}</p>

      <div className="pitch">
        <div className="card-grid">
          {shown.map((c) => (
            <PlayerCard key={c.player_id} card={c} />
          ))}
        </div>
      </div>
    </div>
  );
}