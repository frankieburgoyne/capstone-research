import { useEffect, useState } from "react";

type Game = {
  id: string;
  home_team: string;
  away_team: string;
  home_score: number | null;
  away_score: number | null;
  status: string;
  home_picks: number;
  away_picks: number;
};

export default function App() {
  const [games, setGames] = useState<Game[]>([]);
  const [username, setUsername] = useState("");
  const [search, setSearch] = useState("");
  const [wager, setWager] = useState("10");
  const [message, setMessage] = useState("");

  async function loadGames() {
    const res = await fetch("/api/games");
    setGames(await res.json());
  }

  useEffect(() => {
    loadGames();
  }, []);

  async function makePick(gameId: string, side: "home" | "away") {
    if (!username.trim()) {
      setMessage("Enter a username first.");
      return;
    }
    const res = await fetch("/api/picks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameId, username, pick: side }),
    });
    if (!res.ok) {
      setMessage("Could not save pick.");
      return;
    }
    const quote = await (
      await fetch(`/api/quote?wager=${wager}&side=${side}`)
    ).json();
    setMessage(
      `Pick saved for ${username}! Odds ${quote.odds}. A ${wager}-token wager pays ${quote.payout}.`
    );
    loadGames();
  }

  const shown = games.filter((g) =>
    `${g.home_team} ${g.away_team}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ maxWidth: 700, margin: "2rem auto", fontFamily: "sans-serif" }}>
      <h1>Fantasy Picks</h1>

      <input
        placeholder="Your username"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
      />{" "}
      <input
        placeholder="Search teams"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />{" "}
      <input
        placeholder="Wager (tokens)"
        value={wager}
        onChange={(e) => setWager(e.target.value)}
      />
      <p>{message}</p>

      {shown.map((g) => (
        <div
          key={g.id}
          style={{ border: "1px solid #ccc", padding: 12, margin: "12px 0" }}
        >
          <strong>
            {g.away_team} @ {g.home_team}
          </strong>{" "}
          ({g.status})
          <div>
            {g.away_score ?? "-"} : {g.home_score ?? "-"}
          </div>
          <button onClick={() => makePick(g.id, "away")}>
            Pick {g.away_team} ({g.away_picks})
          </button>{" "}
          <button onClick={() => makePick(g.id, "home")}>
            Pick {g.home_team} ({g.home_picks})
          </button>
        </div>
      ))}
    </div>
  );
}