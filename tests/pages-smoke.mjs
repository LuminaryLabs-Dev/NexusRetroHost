import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { chromium } from "playwright";
const root=resolve("dist"),types={".html":"text/html",".js":"text/javascript",".wasm":"application/wasm",".json":"application/json",".css":"text/css",".gb":"application/octet-stream",".gbc":"application/octet-stream"};
const server=createServer(async(req,res)=>{try{const url=new URL(req.url,"http://127.0.0.1"),relative=decodeURIComponent(url.pathname).replace(/^\/+/, "")||"index.html",path=resolve(root,relative);if(path!==root&&!path.startsWith(root+sep))throw new Error("bad path");const info=await stat(path);if(!info.isFile())throw new Error("not file");res.writeHead(200,{"Content-Type":types[extname(path).toLowerCase()]??"application/octet-stream","Cross-Origin-Opener-Policy":"same-origin","Cross-Origin-Embedder-Policy":"require-corp"});res.end(await readFile(path));}catch{res.writeHead(404).end();}});
await new Promise((ok,fail)=>{server.once("error",fail);server.listen(0,"127.0.0.1",ok);});
const errors=[],browser=await chromium.launch({headless:true}),page=await browser.newPage();page.on("console",m=>{if(m.type()==="error")errors.push(m.text())});page.on("pageerror",e=>errors.push(e.message));
try{
 await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:"networkidle"});
 await page.waitForFunction(()=>document.querySelectorAll(".game-card").length===50);
 await page.locator(".game-card").first().click();
 await page.waitForFunction(()=>{const status=document.querySelector("#status");return status?.textContent?.startsWith("Loaded")||status?.classList.contains("error")},{},{timeout:15000});
 const loadState=await page.locator("#status").evaluate(el=>({text:el.textContent,error:el.classList.contains("error")}));
 if(loadState.error)throw new Error(`Game load failed: ${loadState.text}; browser errors: ${errors.join(" | ")}`);
 await page.locator("#step").click();await page.waitForFunction(()=>document.querySelector("#frame-badge")?.textContent==="Frame 1");
 const rendered=await page.locator("#screen").evaluate(c=>c.width>0&&c.height>0);if(!rendered)throw new Error("Canvas did not render.");
 await page.locator("#inspect").click();await page.waitForFunction(()=>document.querySelector("#state")?.textContent?.includes('"history"'));
 if(errors.length)throw new Error(`Browser errors: ${errors.join(" | ")}`);
 console.log("STATE: SANDBOX_VERIFIED Pages WASM + game + Nexus inspector PASS");
}finally{await browser.close();await new Promise(ok=>server.close(ok));}
