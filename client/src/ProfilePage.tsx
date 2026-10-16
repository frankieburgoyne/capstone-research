import { useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useAuth } from "./auth";
import type { User } from "./auth";
import { CoinIcon, TrophyIcon } from "./Icons";

const ACCENTS = [
  { key: "blue", label: "Blue", color: "#2f7bff" },
  { key: "cyan", label: "Cyan", color: "#3fd4f2" },
  { key: "green", label: "Green", color: "#2fd18b" },
  { key: "gold", label: "Gold", color: "#d4a017" },
  { key: "elite", label: "Violet", color: "#8e44ad" },
];

const BANNERS = [
  { key: "floodlight", label: "Floodlight" },
  { key: "field", label: "Pitch" },
  { key: "stripes", label: "Stripes" },
  { key: "night", label: "Night" },
];

// Crops a picked photo to a square and shrinks it, so it stays small enough to save
function shrinkImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const size = 160;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        return reject(new Error("Could not prepare that image."));
      }
      const side = Math.min(img.width, img.height);
      ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that image."));
    };
    img.src = url;
  });
}

function initialsOf(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function ProfilePage() {
  const { user, refresh } = useAuth();
  if (!user) return null; // RequireAuth in App.tsx keeps logged-out visitors from getting here
  // The form is keyed by user id so it resets cleanly after a reload
  return <ProfileView key={user.id} user={user} onSaved={refresh} />;
}

function ProfileView({ user, onSaved }: { user: User; onSaved: () => Promise<void> }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [bio, setBio] = useState(user.bio);
  const [favoriteTeam, setFavoriteTeam] = useState(user.favorite_team);
  const [accent, setAccent] = useState(user.accent);
  const [banner, setBanner] = useState(user.banner);
  // undefined = keep the current picture, null = remove it, string = a new picture
  const [avatar, setAvatar] = useState<string | null | undefined>(undefined);
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  const accentColor = ACCENTS.find((a) => a.key === accent)?.color ?? "#2f7bff";
  const shownAvatar = avatar === undefined ? user.avatar : avatar;
  const dirty =
    bio !== user.bio ||
    favoriteTeam !== user.favorite_team ||
    accent !== user.accent ||
    banner !== user.banner ||
    avatar !== undefined;

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow picking the same file again later
    if (!file) return;
    if (!file.type.startsWith("image/")) return setStatus("Pick an image file.");
    try {
      setAvatar(await shrinkImage(file));
      setStatus("");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Could not read that image.");
    }
  }

  async function save() {
    setSaving(true);
    setStatus("");
    const body: Record<string, unknown> = { bio, favoriteTeam, accent, banner };
    if (avatar !== undefined) body.avatar = avatar;
    try {
      const res = await fetch("/api/auth/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus(data.error ?? "Could not save your profile.");
      } else {
        setAvatar(undefined);
        await onSaved();
        setStatus("Saved.");
      }
    } catch {
      setStatus("Could not reach the server.");
    }
    setSaving(false);
  }

  return (
    <div
      className="profile"
      style={{ "--accent": accentColor } as CSSProperties}
    >
      <section className="profile-hero">
        <div className={`profile-banner banner-${banner}`} aria-hidden="true" />
        <div className="profile-id">
          <button
            type="button"
            className="avatar-btn"
            onClick={() => fileRef.current?.click()}
            aria-label="Change profile picture"
          >
            {shownAvatar ? (
              <img className="avatar" src={shownAvatar} alt="" />
            ) : (
              <span className="avatar avatar-initials">{initialsOf(user.display_name)}</span>
            )}
            <span className="avatar-edit">Change</span>
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPick} />

          <div className="profile-names">
            <h1>{user.display_name}</h1>
            <p className="profile-bio">{bio.trim() || "No bio yet. Add one below."}</p>
            <p className="muted profile-email">
              {favoriteTeam.trim() ? `Fav team: ${favoriteTeam.trim()} · ` : ""}
              {user.email}
            </p>
          </div>
        </div>

        <div className="profile-stats">
          <span className="stat-pill gold">
            <TrophyIcon />
            {user.trophies.toLocaleString()}
            <small>trophies · best {user.best_trophies.toLocaleString()}</small>
          </span>
          <span className="stat-pill">
            <CoinIcon />
            {user.tokens.toLocaleString()}
            <small>tokens</small>
          </span>
        </div>
      </section>

      <section className="profile-edit form-card">
        <h2>Customize</h2>

        <label className="field-label">
          <span>Bio</span>
          <textarea
            value={bio}
            maxLength={160}
            rows={3}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Who drafts like you?"
          />
          <span className="muted field-count">{bio.length}/160</span>
        </label>

        <label className="field-label">
          <span>Favourite team</span>
          <input
            value={favoriteTeam}
            maxLength={40}
            onChange={(e) => setFavoriteTeam(e.target.value)}
            placeholder="e.g. Steelers"
          />
        </label>

        <div className="field-label">
          <span>Accent colour</span>
          <div className="swatches" role="group" aria-label="Accent colour">
            {ACCENTS.map((a) => (
              <button
                key={a.key}
                type="button"
                className={`swatch ${accent === a.key ? "chosen" : ""}`}
                style={{ "--swatch": a.color } as CSSProperties}
                aria-pressed={accent === a.key}
                onClick={() => setAccent(a.key)}
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>

        <div className="field-label">
          <span>Banner</span>
          <div className="banner-choices" role="group" aria-label="Banner style">
            {BANNERS.map((b) => (
              <button
                key={b.key}
                type="button"
                className={`banner-choice ${banner === b.key ? "chosen" : ""}`}
                aria-pressed={banner === b.key}
                onClick={() => setBanner(b.key)}
              >
                <span className={`banner-swatch banner-${b.key}`} aria-hidden="true" />
                {b.label}
              </button>
            ))}
          </div>
        </div>

        <div className="field-label">
          <span>Profile picture</span>
          <div className="submit-row">
            <button type="button" onClick={() => fileRef.current?.click()}>
              Upload picture
            </button>
            {shownAvatar && (
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setAvatar(null)}
              >
                Remove picture
              </button>
            )}
            {avatar !== undefined && <span className="muted">Saves when you press Save.</span>}
          </div>
        </div>

        <div className="submit-row">
          <button type="button" className="btn-primary" onClick={save} disabled={!dirty || saving}>
            {saving ? "Saving..." : "Save profile"}
          </button>
          {status && <span className={status === "Saved." ? "good" : "error"}>{status}</span>}
        </div>
      </section>
    </div>
  );
}
