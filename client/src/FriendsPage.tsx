import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { useAuth } from "./auth";
import { useToast } from "./Toast";

type Friend = {
  id: number;
  display_name: string;
  trophies: number;
  best_trophies: number;
  unread: number;
  wins: number;
  losses: number;
  draws: number;
};
type Pending = { id: number; display_name: string; trophies: number };
type Found = { id: number; display_name: string; trophies: number; relation: "none" | "friend" | "sent" | "received" };
type ChallengeRow = {
  id: number;
  status: "drafting" | "invited" | "accepted" | "complete";
  wager: number;
  mode_name: string;
  challenger_id: number;
  challenger_name: string;
  opponent_name: string;
  winner_id: number | null;
  challenger_total: number | null;
  opponent_total: number | null;
};

function changed() {
  window.dispatchEvent(new Event("social-changed"));
}

async function post(path: string, body: object, method = "POST") {
  const res = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: method === "DELETE" ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

export default function FriendsPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [incoming, setIncoming] = useState<Pending[]>([]);
  const [outgoing, setOutgoing] = useState<Pending[]>([]);
  const [challenges, setChallenges] = useState<ChallengeRow[]>([]);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Found[]>([]);
  const [status, setStatus] = useState("Loading...");

  const load = useCallback(() => {
    Promise.all([
      fetch("/api/friends").then((r) => r.json()),
      fetch("/api/challenges").then((r) => r.json()),
    ])
      .then(([f, c]) => {
        if (Array.isArray(f.friends)) {
          setFriends(f.friends);
          setIncoming(f.incoming);
          setOutgoing(f.outgoing);
          setStatus("");
        } else {
          setStatus(f.error ?? "Could not load friends.");
        }
        if (Array.isArray(c)) setChallenges(c);
      })
      .catch(() => setStatus("Could not reach the server."));
  }, []);

  useEffect(() => {
    load();
    window.addEventListener("social-changed", load);
    return () => window.removeEventListener("social-changed", load);
  }, [load]);

  // Search as you type (after a short pause)
  useEffect(() => {
    if (query.trim().length < 2) {
      setFound([]);
      return;
    }
    const timer = setTimeout(() => {
      fetch(`/api/friends/search?q=${encodeURIComponent(query.trim())}`)
        .then((r) => r.json())
        .then((d) => setFound(Array.isArray(d) ? d : []))
        .catch(() => {});
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  async function act(promise: Promise<{ ok: boolean; data: any }>, success: string) {
    const { ok, data } = await promise;
    if (ok) toast(success, "good");
    else toast(data.error ?? "Something went wrong.", "bad");
    changed();
    load();
    return ok;
  }

  async function addFriend(p: Found) {
    const ok = await act(post("/api/friends/request", { userId: p.id }), `Request sent to ${p.display_name}`);
    if (ok) setFound((list) => list.map((x) => (x.id === p.id ? { ...x, relation: "sent" } : x)));
  }

  if (!user) return null;

  return (
    <div>
      <h1>Friends</h1>
      <p className="muted">
        Add friends by name, message them, and challenge them to a lineup battle. Friends are ranked by trophies.
      </p>
      {status && <p className="muted">{status}</p>}

      <h2>Find a player</h2>
      <div className="search-row">
        <input
          type="search"
          placeholder="Type at least 2 letters of a display name"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search players by name"
        />
      </div>
      {found.length > 0 && (
        <ul className="people">
          {found.map((p) => (
            <li key={p.id} className="person noimg">
              <div>
                <div className="person-name">
                  {p.display_name} <span className="muted">#{p.id}</span>
                </div>
                <div className="person-meta">
                  <span className="stat">{p.trophies}</span> trophies
                </div>
              </div>
              <div className="actions">
                {p.relation === "none" && (
                  <button className="btn-primary btn-small" onClick={() => addFriend(p)}>
                    Add friend
                  </button>
                )}
                {p.relation === "sent" && <span className="muted">Request sent</span>}
                {p.relation === "friend" && <span className="good">Friends</span>}
                {p.relation === "received" && (
                  <button
                    className="btn-green btn-small"
                    onClick={() => act(post("/api/friends/respond", { userId: p.id, accept: true }), `You and ${p.display_name} are friends`)}
                  >
                    Accept request
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {query.trim().length >= 2 && found.length === 0 && <p className="muted">No players found with that name.</p>}

      {(incoming.length > 0 || outgoing.length > 0) && (
        <>
          <h2>Requests</h2>
          <ul className="people">
            {incoming.map((p) => (
              <li key={p.id} className="person noimg">
                <div>
                  <div className="person-name">{p.display_name}</div>
                  <div className="person-meta">wants to be friends</div>
                </div>
                <div className="actions">
                  <button
                    className="btn-green btn-small"
                    onClick={() => act(post("/api/friends/respond", { userId: p.id, accept: true }), `You and ${p.display_name} are friends`)}
                  >
                    Accept
                  </button>
                  <button
                    className="btn-small"
                    onClick={() => act(post("/api/friends/respond", { userId: p.id, accept: false }), "Request declined")}
                  >
                    Decline
                  </button>
                </div>
              </li>
            ))}
            {outgoing.map((p) => (
              <li key={p.id} className="person noimg">
                <div>
                  <div className="person-name">{p.display_name}</div>
                  <div className="person-meta">request sent</div>
                </div>
                <div className="actions">
                  <button className="btn-small" onClick={() => act(post(`/api/friends/${p.id}`, {}, "DELETE"), "Request cancelled")}>
                    Cancel
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <h2>Your friends</h2>
      {friends.length === 0 && status === "" && (
        <p className="muted">No friends yet. Search for a player above to send your first request.</p>
      )}
      <ul className="people">
        {friends.map((f, i) => (
          <li key={f.id} className="person">
            <span className={i === 0 ? "rank first" : "rank"}>{i + 1}</span>
            <div>
              <div className="person-name">{f.display_name}</div>
              <div className="person-meta">
                <span className="stat">{f.trophies}</span> trophies · best {f.best_trophies}
                {f.wins + f.losses + f.draws > 0 && (
                  <>
                    {" · "}
                    <span className="record">
                      You {f.wins}-{f.losses}
                      {f.draws > 0 ? `-${f.draws}` : ""}
                    </span>
                  </>
                )}
              </div>
            </div>
            <div className="actions">
              <Link to={`/chat/${f.id}`} className="btn btn-small">
                Message{f.unread > 0 && <span className="badge">{f.unread}</span>}
              </Link>
              <Link to={`/friends/${f.id}/challenge`} className="btn btn-primary btn-small">
                Challenge
              </Link>
              <button
                className="btn-small btn-ghost"
                onClick={() => {
                  if (window.confirm(`Remove ${f.display_name} from your friends?`)) {
                    act(post(`/api/friends/${f.id}`, {}, "DELETE"), "Friend removed");
                  }
                }}
              >
                Remove
              </button>
            </div>
          </li>
        ))}
      </ul>

      {challenges.length > 0 && (
        <>
          <h2>Challenges</h2>
          <ul className="people">
            {challenges.map((c) => {
              const mine = c.challenger_id === user.id;
              const other = mine ? c.opponent_name : c.challenger_name;
              const label =
                c.status === "complete"
                  ? c.winner_id === null
                    ? "Draw"
                    : c.winner_id === user.id
                      ? "You won"
                      : "You lost"
                  : c.status === "drafting"
                    ? "Finish your lineup"
                    : c.status === "invited"
                      ? mine
                        ? "Waiting for them"
                        : "Waiting for you"
                      : mine
                        ? "They are drafting"
                        : "Your turn to draft";
              return (
                <li key={c.id} className="person noimg">
                  <div>
                    <div className="person-name">
                      You vs {other} <span className="muted">· {c.mode_name}</span>
                    </div>
                    <div className="person-meta">
                      {c.wager > 0 ? `${c.wager} token wager` : "Friendly, no wager"} ·{" "}
                      <span className={c.status === "complete" ? (c.winner_id === user.id ? "good" : "") : "stat"}>{label}</span>
                    </div>
                  </div>
                  <div className="actions">
                    <Link to={`/challenges/${c.id}`} className="btn btn-small">
                      Open
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}