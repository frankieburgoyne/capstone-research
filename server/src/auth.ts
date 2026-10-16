import bcrypt from "bcryptjs";
import connectPgSimple from "connect-pg-simple";
import type { Express } from "express";
import { Router } from "express";
import session from "express-session";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { pool } from "./db.js";

// What we keep about a logged-in user (never the password hash)
   type PublicUser = {
     id: number;
     email: string;
     display_name: string;
     tokens: number;
     trophies: number;
     best_trophies: number;
     bio: string;
     favorite_team: string;
     accent: string;
     banner: string;
     avatar: string | null;
   };

declare global {
  namespace Express {
    interface User extends PublicUser {}
  }
}

   const PUBLIC_COLUMNS =
     "id, email, display_name, tokens, trophies, best_trophies, bio, favorite_team, accent, banner, avatar";
   const ACCENTS = ["blue", "cyan", "green", "gold", "elite"];
   const BANNERS = ["floodlight", "field", "stripes", "night"];
   
// Called once at startup. Adds login sessions and Passport to the Express app.
export function setupAuth(app: Express) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET is not set. Add it to server/.env (and to Render's environment).");
  }

  // Render sits behind a proxy; this lets Express see that visitors use https
  app.set("trust proxy", 1);

  const PgSession = connectPgSimple(session);
  app.use(
    session({
      store: new PgSession({ pool, tableName: "session" }),
      secret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true, // JavaScript on the page cannot read the cookie
        sameSite: "lax", // the browser will not send it on cross-site POSTs
        secure: "auto", // https only when the connection is https
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      },
    })
  );

  app.use(passport.initialize());
  app.use(passport.session());

  // How Passport checks an email and password
  passport.use(
    new LocalStrategy({ usernameField: "email" }, async (email, password, done) => {
      try {
        const { rows } = await pool.query(
          `SELECT ${PUBLIC_COLUMNS}, password_hash FROM users WHERE email = $1`,
          [email.trim().toLowerCase()]
        );
        const row = rows[0];
        if (!row || !(await bcrypt.compare(password, row.password_hash))) {
          return done(null, false);
        }
        const { password_hash, ...user } = row;
        return done(null, user);
      } catch (err) {
        return done(err);
      }
    })
  );

  // The session cookie stores only the user's id...
  passport.serializeUser((user, done) => done(null, user.id));
  // ...and on each request we look the user up again.
  passport.deserializeUser(async (id: number, done) => {
    try {
      const { rows } = await pool.query(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = $1`, [id]);
      done(null, rows[0] ?? false);
    } catch (err) {
      done(err);
    }
  });
}

export const authRouter = Router();

// POST /api/auth/register  { email, password, displayName }
authRouter.post("/register", async (req, res, next) => {
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const password = String(req.body?.password ?? "");
  const displayName = String(req.body?.displayName ?? "").trim();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) {
    return res.status(400).json({ error: "Enter a valid email address." });
  }
  if (password.length < 8 || password.length > 72) {
    return res.status(400).json({ error: "Password must be 8 to 72 characters." });
  }
  if (displayName.length < 1 || displayName.length > 30) {
    return res.status(400).json({ error: "Display name must be 1 to 30 characters." });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const { rows } = await pool.query(
      `INSERT INTO users (email, display_name, password_hash)
       VALUES ($1, $2, $3) RETURNING ${PUBLIC_COLUMNS}`,
      [email, displayName, passwordHash]
    );
    // Log the new user in right away
    req.logIn(rows[0], (err) => {
      if (err) return next(err);
      res.status(201).json(rows[0]);
    });
  } catch (err: any) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "That email is already registered." });
    }
    next(err);
  }
});

// POST /api/auth/login  { email, password }
authRouter.post("/login", (req, res, next) => {
  passport.authenticate("local", (err: unknown, user: Express.User | false) => {
    if (err) return next(err);
    if (!user) return res.status(401).json({ error: "Wrong email or password." });
    req.logIn(user, (loginErr) => {
      if (loginErr) return next(loginErr);
      res.json(user);
    });
  })(req, res, next);
});

// POST /api/auth/logout
authRouter.post("/logout", (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    req.session.destroy(() => {
      res.clearCookie("connect.sid");
      res.json({ ok: true });
    });
  });
});

// GET /api/auth/me -> the logged-in user, or 401
// PUT /api/auth/profile  { bio, favoriteTeam, accent, banner, avatar }
// avatar: a data URL to set it, null to remove it, or leave it out to keep the current one.
authRouter.put("/profile", async (req, res) => {
  if (!req.user) return res.status(401).json({ error: "Log in first." });
  const bio = String(req.body?.bio ?? "").trim();
  const favoriteTeam = String(req.body?.favoriteTeam ?? "").trim();
  if (bio.length > 160) return res.status(400).json({ error: "Bio can be up to 160 characters." });
  if (favoriteTeam.length > 40) return res.status(400).json({ error: "Favourite team can be up to 40 characters." });
  const accent = ACCENTS.includes(req.body?.accent) ? req.body.accent : "blue";
  const banner = BANNERS.includes(req.body?.banner) ? req.body.banner : "floodlight";

  let avatarSet = false;
  let avatar: string | null = null;
  if (req.body?.avatar !== undefined) {
    avatarSet = true;
    if (req.body.avatar !== null) {
      avatar = String(req.body.avatar);
      if (!/^data:image\/(jpeg|png|webp);base64,/.test(avatar)) {
        return res.status(400).json({ error: "The picture must be a JPEG, PNG or WebP image." });
      }
      if (avatar.length > 90000) return res.status(400).json({ error: "That picture is too large." });
    }
  }

  try {
    const { rows } = await pool.query(
      `UPDATE users
          SET bio = $2, favorite_team = $3, accent = $4, banner = $5,
              avatar = CASE WHEN $6::boolean THEN $7::text ELSE avatar END
        WHERE id = $1
        RETURNING ${PUBLIC_COLUMNS}`,
      [req.user.id, bio, favoriteTeam, accent, banner, avatarSet, avatar]
    );
    res.json(rows[0]);
  } catch {
    res.status(500).json({ error: "Could not save your profile." });
  }
});

authRouter.get("/me", (req, res) => {
  if (!req.user) return res.status(401).json({ error: "Not logged in." });
  res.json(req.user);
});