import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
const root=resolve("."),dist=resolve("dist");
await rm(dist,{recursive:true,force:true});await mkdir(dist,{recursive:true});
for(const [source,target] of [["src/web", "src/web"],["src/adapters","src/adapters"],["profiles","profiles"],["games","games"]])await cp(resolve(source),resolve(dist,target),{recursive:true});
await mkdir(resolve(dist,"worker"),{recursive:true});
await cp(resolve("build/wasm/retro-worker.js"),resolve(dist,"worker/retro-worker.js"));
await cp(resolve("build/wasm/retro-worker.wasm"),resolve(dist,"worker/retro-worker.wasm"));
const packages=[["nexusengine","nexusengine"],["@luminarylabs/nexusengine-kits","nexusengine-kits"]],imports={};
for(const [name,folder] of packages){
  const source=resolve("node_modules",name),target=resolve(dist,"vendor",folder);await cp(source,target,{recursive:true});
  const meta=JSON.parse(await readFile(resolve(source,"package.json"),"utf8"));
  for(const [key,value] of Object.entries(meta.exports??{})){
    if(typeof value!=="string"||!value.startsWith("./"))continue;
    const spec=key==="."?name:`${name}${key.slice(1)}`;imports[spec]=`./vendor/${folder}/${value.slice(2)}`;
  }
}
const template=await readFile("src/web/index.html","utf8");
const importMap=`<script type="importmap">${JSON.stringify({imports})}</script>`;
await writeFile(resolve(dist,"index.html"),template.replace("<!--IMPORT_MAP-->",importMap));
await writeFile(resolve(dist,".nojekyll"),"");
console.log("STATE: WEB_RELEASE_READY dist/ staged");
