import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
const commit = "463eb6bc0fe31d61781ef63060ad6d74090c0255";
const hash = bytes => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const selection = JSON.parse(await readFile("tests/corpus/selection.json", "utf8"));
if (selection.length !== 50 || new Set(selection).size !== 50 || selection.some(name => !/^[a-zA-Z0-9_-]+\.gb$/.test(name))) throw new Error("Invalid corpus selection.");
const args = process.argv.slice(2), offline = args.includes("--offline"), sourceIndex = args.indexOf("--source"), source = sourceIndex < 0 ? null : resolve(args[sourceIndex + 1]);
const existing = await readFile("tests/corpus/manifest.json", "utf8").then(JSON.parse).catch(() => null);
const entries = [];
await mkdir("tests/corpus/roms/gbmicrotest", { recursive: true }); await mkdir("tests/corpus/sources/gbmicrotest", { recursive: true }); await mkdir("tests/corpus/licenses", { recursive: true });
async function fetchSource(path) {
  if (source) return readFile(resolve(source, path));
  const response = await fetch(`https://raw.githubusercontent.com/aappleby/gbmicrotest/${commit}/${path}`); if (!response.ok) throw new Error(`Corpus download failed: ${path}.`); return Buffer.from(await response.arrayBuffer());
}
for (const name of selection) {
  const path = `tests/corpus/roms/gbmicrotest/${name}`, bytes = offline ? await readFile(path) : await fetchSource(`bin/${name}`), contentHash = hash(bytes);
  const previous = existing?.entries.find(entry => entry.id === name);
  if (previous && previous.contentHash !== contentHash) throw new Error(`Corpus integrity mismatch: ${name}.`);
  if (!offline) { await writeFile(path, bytes); const testSource = await fetchSource(`tests/${name.replace(/\.gb$/, ".s")}`); await writeFile(`tests/corpus/sources/gbmicrotest/${name.replace(/\.gb$/, ".s")}`, testSource); }
  entries.push({ id: name, path, bytes: bytes.length, contentHash, system: "gb", license: "MIT", source: `https://github.com/aappleby/gbmicrotest/blob/${commit}/bin/${name}`, oracle: { address: 65408, length: 3, source: `tests/corpus/sources/gbmicrotest/${name.replace(/\.gb$/, ".s")}` } });
}
if (offline) { if (!existing || existing.entries.length !== 50) throw new Error("Missing complete import manifest."); console.log("Corpus integrity: 50/50 PASS"); }
else {
  for (const path of ["LICENSE", "README.md", "tests/macros.inc", "tests/header.inc"]) await writeFile(`tests/corpus/${path === "LICENSE" ? "licenses/gbmicrotest-MIT.txt" : "sources/gbmicrotest/" + path.split("/").at(-1)}`, await fetchSource(path));
  const manifest = { schema: "nexusretro.corpus/1", sourceCommit: commit, license: "MIT", publicDomain: false, entries };
  await writeFile("tests/corpus/manifest.json", JSON.stringify(manifest, null, 2) + "\n");
  const profile = { schema: "nexusretro.game-profile/1", id: "gbmicrotest-dmg", version: 1, system: "gb", contentHashes: entries.map(entry => entry.contentHash), memoryRanges: [{ id: "oracle", space: "cpu", address: 65408, length: 3 }], oracle: { completion: "source-verified-stable-marker", source: "tests/corpus/sources/gbmicrotest/macros.inc", warmupFrames: 60 }, fields: ["actual", "expected", "marker"].map((id, offset) => ({ id, segment: "oracle", offset, width: 1, signed: false, endian: "little", min: 0, max: 255, destination: { kind: "descriptor", domain: "diagnostics", type: "rom-test" } })) };
  await mkdir("profiles/gbmicrotest", { recursive: true }); await writeFile("profiles/gbmicrotest/profile.json", JSON.stringify(profile, null, 2) + "\n");
  await writeFile("tests/corpus/import-receipt.json", JSON.stringify({ schema: "nexusretro.corpus-import/1", sourceCommit: commit, count: 50, manifestHash: hash(Buffer.from(JSON.stringify(manifest))), license: "MIT", publicDomain: false }, null, 2) + "\n"); console.log("Imported 50 MIT Game Boy test ROMs.");
}
