import express from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cardsRouter } from "./cards.js";

const app = express();
app.use(express.json());

app.use("/api/cards", cardsRouter);

// In production, serve the built React page from this same server
const clientDist = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../client/dist"
);
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
}

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => console.log(`Server on port ${PORT}`));