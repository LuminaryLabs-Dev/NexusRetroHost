import { readdir, readFile, writeFile } from "node:fs/promises";
const files=(await readdir("games/manifests")).filter(name=>name.endsWith(".json")).sort();
const entries=[];
for(const file of files)entries.push(JSON.parse(await readFile(`games/manifests/${file}`,"utf8")));
entries.sort((a,b)=>a.title.localeCompare(b.title)||a.id.localeCompare(b.id));
const output=JSON.stringify(entries,null,2)+"\n";
if(process.argv.includes("--check")){
  const current=await readFile("games/catalog.json","utf8");
  if(current!==output){console.error("games/catalog.json is stale; run npm run library:catalog");process.exit(1);}
}else await writeFile("games/catalog.json",output);
console.log(`Catalog entries: ${entries.length}`);
