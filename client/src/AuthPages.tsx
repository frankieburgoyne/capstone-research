import { useState } from "react";
import type { FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import { useAuth } from "./auth";

const formStyle = { display: "flex", flexDirection: "column", gap: 12, maxWidth: 320 } as const;

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/profile" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const message = await login(email, password);
    setBusy(false);
    if (message) setError(message);
    else navigate("/profile");
  }

  return (
    <div>
      <h2>Log in</h2>
      <form onSubmit={onSubmit} style={formStyle}>
        <input
          type="email"
          placeholder="Email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button type="submit" disabled={busy}>
          {busy ? "Logging in..." : "Log in"}
        </button>
        {error && <p style={{ color: "crimson", margin: 0 }}>{error}</p>}
      </form>
      <p>
        No account yet? <Link to="/register">Create one</Link>
      </p>
    </div>
  );
}

export function RegisterPage() {
  const { user, register } = useAuth();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/profile" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const message = await register(email, password, displayName);
    setBusy(false);
    if (message) setError(message);
    else navigate("/profile");
  }

  return (
    <div>
      <h2>Create an account</h2>
      <form onSubmit={onSubmit} style={formStyle}>
        <input
          type="text"
          placeholder="Display name"
          autoComplete="nickname"
          maxLength={30}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          required
        />
        <input
          type="email"
          placeholder="Email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Password (8 or more characters)"
          autoComplete="new-password"
          minLength={8}
          maxLength={72}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button type="submit" disabled={busy}>
          {busy ? "Creating..." : "Create account"}
        </button>
        {error && <p style={{ color: "crimson", margin: 0 }}>{error}</p>}
      </form>
      <p>
        Already have an account? <Link to="/login">Log in</Link>
      </p>
    </div>
  );
}