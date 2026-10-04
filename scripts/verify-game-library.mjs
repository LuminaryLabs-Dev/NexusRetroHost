import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
const catalog=JSON.parse(await readFile("games/catalog.json","utf8"));
const manifests=(await readdir("games/manifests")).filter(name=>name.endsWith(".json"));
if(catalog.length!==50||manifests.length!==50)throw new Error(`Expected exactly 50 bundled games, found catalog=${catalog.length}, manifests=${manifests.length}.`);
const ids=new Set(),hashes=new Set(),allowed=new Set(["MIT","Zlib","ZLib","BSD-3-Clause"]);
for(const game of catalog){
  if(game.schema!=="nexusretro.game/1"||!game.id||!game.title||!["gb","gbc"].includes(game.system))throw new Error(`Invalid manifest: ${game.id??"unknown"}`);
  if(ids.has(game.id))throw new Error(`Duplicate game id: ${game.id}`);ids.add(game.id);
  if(!allowed.has(game.license))throw new Error(`Unapproved bundled license metadata: ${game.id} ${game.license}`);
  if(game.source?.database!=="gbdev/database"||game.source?.commit!=="50293559a496a3e20382fbf6a2e84b70ec622f88"||!game.source?.metadataPath)throw new Error(`Unpinned source: ${game.id}`);
  const path=resolve("games",game.content.path),data=await readFile(path),digest=`sha256:${createHash("sha256").update(data).digest("hex")}`;
  if(digest!==game.content.sha256||data.length!==game.content.bytes)throw new Error(`Content integrity mismatch: ${game.id}`);
  if(hashes.has(digest))throw new Error(`Duplicate ROM content: ${game.id}`);hashes.add(digest);
}
console.log(`STATE: LIBRARY_SOURCE_VERIFIED ${catalog.length}/50 hashes + pinned permissive license metadata PASS`);
