import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link, useParams } from "react-router";
import { useAuth } from "./auth";

type Message = { id: number; sender_id: number; body: string; created_at: string };

function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export default function ChatPage() {
  const { friendId } = useParams();
  const { user } = useAuth();
  const [friendName, setFriendName] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [status, setStatus] = useState("");
  const lastId = useRef(0);
  const log = useRef<HTMLDivElement>(null);

  // Loads the conversation, or just the messages newer than the last one we have
  const load = useCallback(
    (first: boolean) => {
      fetch(`/api/messages/${friendId}?after=${first ? 0 : lastId.current}`)
        .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
        .then(({ ok, d }) => {
          if (!ok) {
            setStatus(d.error ?? "Could not load the conversation.");
            return;
          }
          setFriendName(d.friend?.display_name ?? "");
          if (d.messages.length > 0) {
            lastId.current = d.messages[d.messages.length - 1].id;
            setMessages((current) => (first ? d.messages : [...current, ...d.messages]));
            window.dispatchEvent(new Event("social-changed")); // the unread badge can clear now
          }
        })
        .catch(() => {});
    },
    [friendId]
  );

  useEffect(() => {
    lastId.current = 0;
    setMessages([]);
    load(true);
    const timer = setInterval(() => load(false), 3000);
    return () => clearInterval(timer);
  }, [load]);

  // Keep the newest message in view
  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  async function send(e: FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setText("");
    setStatus("");
    const res = await fetch(`/api/messages/${friendId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setStatus(data.error ?? "Could not send the message.");
      setText(body);
      return;
    }
    lastId.current = Math.max(lastId.current, data.id);
    setMessages((current) => [...current, data]);
  }

  if (!user) return null;

  return (
    <div>
      <h1>{friendName || "Chat"}</h1>
      <p>
        <Link to="/friends">Back to friends</Link>
        {friendName && (
          <>
            {" · "}
            <Link to={`/friends/${friendId}/challenge`}>Challenge {friendName}</Link>
          </>
        )}
      </p>
      <div className="chat">
        <div className="chat-log" ref={log}>
          {messages.length === 0 && !status && <p className="muted">No messages yet. Say hello.</p>}
          {messages.map((m) => (
            <div key={m.id} className={m.sender_id === user.id ? "bubble me" : "bubble them"}>
              {m.body}
              <time>{clock(m.created_at)}</time>
            </div>
          ))}
        </div>
        <form className="chat-form" onSubmit={send}>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Write a message"
            maxLength={500}
            aria-label="Message"
          />
          <button type="submit" className="btn-primary" disabled={!text.trim()}>
            Send
          </button>
        </form>
      </div>
      {status && <p className="error">{status}</p>}
    </div>
  );
}