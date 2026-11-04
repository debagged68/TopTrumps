import { mkdir, copyFile, readFile, readdir, access } from "node:fs/promises";
import { PACKS } from "../lib/packs.mjs";
const root = new URL("../", import.meta.url);
await mkdir(new URL("data/", root), { recursive: true });
await mkdir(new URL("public/", root), { recursive: true });
const source = new URL("../content/server/donald.json", root);
const dataset = JSON.parse(await readFile(source, "utf8"));
if (!dataset.cards?.length)
  throw Error("Generate canonical content/server/donald.json first.");
await copyFile(source, new URL("data/donald.json", root));
await copyFile(
  new URL("../assets/artwork/donald-portrait.png", root),
  new URL("public/trump-art.png", root),
);
// Pack artwork is kept once in assets; publish optimised WebP and legacy PNG files.
await mkdir(new URL("public/packs/", root), { recursive: true });
const packArt = new URL("../assets/artwork/packs/", root);
for (const f of await readdir(packArt).catch(() => []))
  if (/\.(png|webp)$/.test(f))
    await copyFile(new URL(f, packArt), new URL("public/packs/" + f, root));
for (const pack of PACKS) await access(new URL("public" + pack.art, root));
console.log("Prepared canonical card content and artwork.");
