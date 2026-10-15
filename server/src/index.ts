import express from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { authRouter, setupAuth } from "./auth.js";
import { cardsRouter } from "./cards.js";

const app = express();
app.use(express.json());

setupAuth(app);

app.use("/api/auth", authRouter);
app.use("/api/cards", cardsRouter);

// In production, serve the built React page from this same server
const clientDist = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../client/dist"
);
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  // Any other page address (like /login) gets the React page, so refreshing works
  app.use((req, res, next) => {
    if (req.method === "GET" && !req.path.startsWith("/api")) {
      return res.sendFile(path.join(clientDist, "index.html"));
    }
    next();
  });
}

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => console.log(`Server on port ${PORT}`));