import {
  createWriteStream, existsSync, mkdirSync, renameSync, statSync, writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

// Downloads the open nflverse data files (the source behind nfldata.org)
// to a folder OUTSIDE this repo, so you own a complete copy.
//
//   npm run archive-nflverse                    -> dry run: lists files and total size
//   npm run archive-nflverse -- --download      -> downloads everything
//   npm run archive-nflverse -- --download --only=pbp,schedules
//
// The default folder is ~/nfl-archive (C:\Users\<you>\nfl-archive on Windows).

const REPO = "nflverse/nflverse-data";
const API = `https://api.github.com/repos/${REPO}`;
const PRIORITY = [".parquet", ".csv.gz", ".csv"];

type Asset = { name: string; size: number; browser_download_url: string };
type Release = { id: number; tag_name: string; published_at: string; assets: Asset[] };

const headers: Record<string, string> = {
  "User-Agent": "nfl-archive-script",
  Accept: "application/vnd.github+json",
};
if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const fmt = (bytes: number) =>
  bytes >= 1e9 ? `${(bytes / 1e9).toFixed(2)} GB` : `${(bytes / 1e6).toFixed(1)} MB`;

async function api(url: string): Promise<any> {
  const res = await fetch(url, { headers });
  if (!res.ok) {
    let hint = "";
    if (res.status === 403 || res.status === 429) {
      const reset = Number(res.headers.get("x-ratelimit-reset")) * 1000;
      hint = reset
        ? ` GitHub's hourly limit for anonymous requests was reached. Try again after ${new Date(reset).toLocaleTimeString()}.`
        : " Possibly a rate limit. Wait a while and try again.";
    }
    throw new Error(`GitHub API returned ${res.status} for ${url}.${hint}`);
  }
  return res.json();
}

async function listReleases(): Promise<Release[]> {
  const all: Release[] = [];
  for (let page = 1; ; page++) {
    const batch: Release[] = await api(`${API}/releases?per_page=100&page=${page}`);
    all.push(...batch);
    if (batch.length < 100) break;
  }
  return all;
}

// A release's embedded file list may be cut off at 30 or 100 entries.
// If it looks cut off, fetch the full list page by page.
async function allAssets(rel: Release): Promise<Asset[]> {
  if (rel.assets.length !== 30 && rel.assets.length !== 100) return rel.assets;
  const out: Asset[] = [];
  for (let page = 1; ; page++) {
    const batch: Asset[] = await api(`${API}/releases/${rel.id}/assets?per_page=100&page=${page}`);
    out.push(...batch);
    if (batch.length < 100) break;
  }
  return out;
}

// For each dataset keep one file: Parquet if it exists, else CSV
function pick(assets: Asset[]): Asset[] {
  const groups = new Map<string, Asset[]>();
  for (const a of assets) {
    const base = a.name.replace(/\.(parquet|csv\.gz|csv|rds|qs|json|zip)$/, "");
    groups.set(base, [...(groups.get(base) ?? []), a]);
  }
  const chosen: Asset[] = [];
  for (const group of groups.values()) {
    for (const ext of PRIORITY) {
      const hit = group.find((a) => a.name.endsWith(ext));
      if (hit) {
        chosen.push(hit);
        break;
      }
    }
  }
  return chosen;
}

async function downloadFile(url: string, dest: string, expected: number): Promise<"skipped" | "downloaded"> {
  if (existsSync(dest) && statSync(dest).size === expected) return "skipped";
  const tmp = `${dest}.part`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      await pipeline(Readable.fromWeb(res.body as any), createWriteStream(tmp));
      if (statSync(tmp).size !== expected) throw new Error("size did not match");
      renameSync(tmp, dest);
      return "downloaded";
    } catch (err) {
      console.log(`    failed (${(err as Error).message}), retry ${attempt}/3`);
      await sleep(2000 * attempt);
    }
  }
  throw new Error(`Could not download ${url}`);
}

async function main() {
  const args = process.argv.slice(2);
  const doDownload = args.includes("--download");
  const onlyArg = args.find((a) => a.startsWith("--only="));
  const only = onlyArg ? onlyArg.slice("--only=".length).split(",") : null;
  const outDir = args.find((a) => !a.startsWith("--")) ?? path.join(homedir(), "nfl-archive");

  console.log("Listing nflverse releases...");
  const releases = (await listReleases()).filter((r) => !only || only.includes(r.tag_name));

  const plan: { tag: string; files: Asset[] }[] = [];
  for (const rel of releases) {
    plan.push({ tag: rel.tag_name, files: pick(await allAssets(rel)) });
  }

  let totalFiles = 0;
  let totalBytes = 0;
  console.log("");
  for (const p of [...plan].sort((a, b) => a.tag.localeCompare(b.tag))) {
    const bytes = p.files.reduce((sum, f) => sum + f.size, 0);
    totalFiles += p.files.length;
    totalBytes += bytes;
    console.log(`${p.tag.padEnd(22)} ${String(p.files.length).padStart(5)} files  ${fmt(bytes).padStart(10)}`);
  }
  console.log(`\nTOTAL: ${totalFiles} files, ${fmt(totalBytes)}  (folder: ${outDir})`);

  if (!doDownload) {
    console.log("\nDry run only. Nothing was downloaded.");
    console.log("To download everything, run: npm run archive-nflverse -- --download");
    return;
  }

  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    path.join(outDir, "ABOUT.txt"),
    [
      "nflverse data archive",
      `Downloaded: ${new Date().toISOString()}`,
      "Source: https://github.com/nflverse/nflverse-data (GitHub release files)",
      "Format: Parquet where available, otherwise CSV. One folder per release tag.",
      "License: see the nflverse-data repository. Most data is CC-BY 4.0 (credit nflverse); some datasets have other terms.",
      "This is the open data behind https://api.nfldata.org",
      "Do not commit this folder to Git.",
    ].join("\n")
  );

  const manifest: { tag: string; file: string; bytes: number; url: string }[] = [];
  const failures: string[] = [];
  let done = 0;
  let downloaded = 0;
  let skipped = 0;

  for (const p of plan) {
    const dir = path.join(outDir, p.tag);
    mkdirSync(dir, { recursive: true });
    for (const f of p.files) {
      done++;
      console.log(`[${done}/${totalFiles}] ${p.tag}/${f.name} (${fmt(f.size)})`);
      try {
        const result = await downloadFile(f.browser_download_url, path.join(dir, f.name), f.size);
        if (result === "downloaded") downloaded++;
        else skipped++;
        manifest.push({ tag: p.tag, file: f.name, bytes: f.size, url: f.browser_download_url });
      } catch (err) {
        failures.push(`${p.tag}/${f.name}: ${(err as Error).message}`);
      }
    }
  }

  writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(`\nDone. Downloaded ${downloaded}, already up to date ${skipped}, failed ${failures.length}.`);
  if (failures.length > 0) {
    console.log("Failed files (run the same command again to retry them):");
    for (const f of failures) console.log(`  ${f}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});