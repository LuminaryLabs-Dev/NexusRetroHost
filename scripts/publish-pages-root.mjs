/**
 * Promote a sandbox-verified WASM Pages build to the repository root.
 * Run locally; GitHub Actions is not used for compilation.
 */
import { cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
const root = resolve("."), dist = resolve("dist");
for (const name of ["index.html","worker/retro-worker.js","worker/retro-worker.wasm","games/catalog.json"]) {
 const file = await stat(resolve(dist,name));
 if (!file.isFile() || !file.size) throw new Error("Missing compiled asset: "+name);
}
const catalog = JSON.parse(await readFile(resolve(dist,"games/catalog.json"),"utf8"));
if (catalog.length !== 50) throw new Error("Expected 50 bundled games.");
const html = await readFile(resolve(dist,"index.html"),"utf8");
if (!html.includes('type="importmap"') || html.includes("<!--IMPORT_MAP-->")) throw new Error("WASM app import map is missing.");
for (const name of ["worker","vendor"]) {
 await rm(resolve(root,name),{recursive:true,force:true});
 await cp(resolve(dist,name),resolve(root,name),{recursive:true});
}
await mkdir(resolve(root,"games"),{recursive:true});
await cp(resolve(dist,"games/catalog.json"),resolve(root,"games/catalog.json"));
await writeFile(resolve(root,"index.html"),html);
await writeFile(resolve(root,".nojekyll"),"");
console.log("STATE: PAGES_ROOT_STAGED validated compiled worker and 50-game catalog");
