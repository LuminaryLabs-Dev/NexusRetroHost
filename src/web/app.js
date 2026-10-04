import { createBrowserRetroEngine } from "./bootstrap-browser.js";
import { BrowserRetroSession } from "./browser-session.js";

const $=id=>document.getElementById(id), engine=createBrowserRetroEngine(), session=new BrowserRetroSession(engine);
const pressed=new Set();let running=false,generation=0,audioContext=null,playback=null,profile=null,catalog=[];
const catalogBase=new URL("./games/",location.href);
const bytes=text=>Uint8Array.from(atob(text),c=>c.charCodeAt(0));

async function ensureProfile(){if(profile!==null)return profile;try{const r=await fetch("./profiles/gbmicrotest/profile.json");profile=r.ok?await r.json():false;}catch{profile=false;}return profile||null;}
async function ensureAudio(){audioContext??=new AudioContext();playback??=engine.n.pcmAudio.createPlayback(audioContext);await audioContext.resume();}
function setStatus(text,error=false){$("status").textContent=text;$("status").className=error?"error":"";}
function renderFrame(frame){
 const rgba=engine.n.rasterFrame.convert(frame.video,frame.segments.get("video"));const canvas=$("screen");canvas.width=frame.video.width;canvas.height=frame.video.height;
 canvas.getContext("2d").putImageData(new ImageData(rgba,frame.video.width,frame.video.height),0,0);$("frame-badge").textContent=`Frame ${frame.sourceFrame}`;
 const pcm=frame.segments.get("audio");if(playback&&pcm?.byteLength)playback.enqueue(pcm,frame.audio.sampleRate);
}
async function step(){const view=generation,frame=await session.step([...pressed]);if(view!==generation)return;renderFrame(frame);setStatus(`Running ${session.content?.name??"content"} · frame ${frame.sourceFrame}`);}
async function safe(work){try{await work();}catch(error){running=false;setStatus(error.message,true);throw error;}}
async function loadBytes(name,data,title=name){running=false;generation++;playback?.reset();await session.load(name,data,await ensureProfile());$("game-title").textContent=title;$("target").value=0;$("frame-badge").textContent="Frame 0";setStatus(`Loaded ${title}`);}
async function loadGame(game){setStatus(`Loading ${game.title}…`);const response=await fetch(new URL(game.content.path,catalogBase));if(!response.ok)throw new Error(`Could not load ${game.title}.`);await loadBytes(game.content.filename,new Uint8Array(await response.arrayBuffer()),game.title);}
async function loadCatalog(){
 const response=await fetch("./games/catalog.json");if(!response.ok)throw new Error("Bundled game catalog is unavailable.");catalog=await response.json();
 $("library-count").textContent=`${catalog.length} bundled redistributable Game Boy titles`;$("library").replaceChildren(...catalog.map(game=>{const b=document.createElement("button");b.className="game-card";b.dataset.id=game.id;b.innerHTML=`<strong></strong><span></span>`;b.querySelector("strong").textContent=game.title;b.querySelector("span").textContent=`${game.system.toUpperCase()} · ${game.license}`;b.onclick=()=>safe(()=>loadGame(game));return b;}));
}
$("rom").onchange=()=>safe(async()=>{const file=$("rom").files[0];if(!file)return;await loadBytes(file.name,new Uint8Array(await file.arrayBuffer()),file.name);});
$("step").onclick=()=>safe(step);
$("run").onclick=()=>safe(async()=>{await ensureAudio();if(session.status==="paused")session.run();if(running)return;running=true;while(running&&session.status==="running"){const started=performance.now();await step();const fps=session.timing?.fps??59.7;await new Promise(resolve=>setTimeout(resolve,Math.max(0,1000/fps-(performance.now()-started))));}});
$("pause").onclick=()=>safe(async()=>{running=false;session.pause();playback?.reset();setStatus("Paused");});
$("reset").onclick=()=>safe(async()=>{running=false;generation++;await session.reset();playback?.reset();$("frame-badge").textContent="Frame 0";setStatus("Reset complete");});
$("save").onclick=()=>safe(async()=>{running=false;await session.save();setStatus("Save complete");});
$("restore").onclick=()=>safe(async()=>{running=false;generation++;const result=await session.restore();playback?.reset();$("frame-badge").textContent=`Frame ${result.sourceFrame}`;setStatus("Restore complete");});
$("rewind").onclick=()=>safe(async()=>{running=false;generation++;const result=await session.rewind(Number($("target").value));playback?.reset();$("frame-badge").textContent=`Frame ${result.sourceFrame}`;setStatus(`Rewound to frame ${result.sourceFrame}`);});
$("inspect").onclick=()=>safe(async()=>{$("state").textContent=JSON.stringify(session.inspect(),null,2);});
const keys={ArrowUp:"up",ArrowDown:"down",ArrowLeft:"left",ArrowRight:"right",z:"b",x:"a",Enter:"start",Shift:"select"};
addEventListener("keydown",e=>{if(keys[e.key]){pressed.add(keys[e.key]);e.preventDefault();}});addEventListener("keyup",e=>{if(keys[e.key])pressed.delete(keys[e.key]);});addEventListener("blur",()=>{pressed.clear();running=false;});
for(const button of document.querySelectorAll("[data-action]")){const action=button.dataset.action;button.addEventListener("pointerdown",e=>{button.setPointerCapture(e.pointerId);pressed.add(action);});for(const event of["pointerup","pointercancel","lostpointercapture"])button.addEventListener(event,()=>pressed.delete(action));}
await safe(loadCatalog);
