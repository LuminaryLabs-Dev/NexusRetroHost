import { readFile, rm, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createRetroEngine } from "../src/bootstrap.js";
import { RetroSession } from "../src/session-controller.js";
const core=process.env.RETRO_CORE;if(!core)throw new Error("RETRO_CORE is required.");
const worker=process.env.RETRO_WORKER??"build/native/retro-worker",catalog=JSON.parse(await readFile("games/catalog.json","utf8")),results=[];
await mkdir("build/library-saves",{recursive:true});
const engine=createRetroEngine({worker:{executable:worker,corePath:core,options:{sameboy_model:"Auto"}}});
const session=new RetroSession(engine,{systems:["gb","gbc"],settings:{sameboy_model:"Auto"}});
try{
 for(const game of catalog){
  const started=Date.now(),save=resolve("build/library-saves",`${game.id}.nrs`);
  try{
   await session.load(resolve("games",game.content.path));
   let inputFrame=null,frame=null;
   for(let i=0;i<65;i++){const actions=i===2?["start"]:i===20?["a"]:[];frame=await session.step(actions);if(actions.length)inputFrame=frame;}
   if(!frame?.video?.width||!frame?.video?.height||!frame.segments.get("video")?.byteLength)throw new Error("No rendered frame.");
   if(!inputFrame?.inputPacket?.some(value=>value!==0))throw new Error("Input packet was not observed.");
   const before=session.sourceFrame;await session.rewind(60);if(session.sourceFrame!==60)throw new Error("Rewind failed.");
   await session.save(save);await session.step(["a"]);await session.restore(save);if(session.sourceFrame!==60)throw new Error("Restore failed.");
   const history=engine.n.observationHistory.list({limit:600});if(!history.length||history.at(-1).contentHash!==game.content.sha256)throw new Error("Nexus history missing content identity.");
   results.push({id:game.id,status:"PASS",frames:before,width:frame.video.width,height:frame.video.height,elapsedMs:Date.now()-started});
   console.error(`PASS ${game.id}`);
  }catch(error){results.push({id:game.id,status:"FAIL",error:error.message,elapsedMs:Date.now()-started});console.error(`FAIL ${game.id}: ${error.message}`);}
 }
}finally{await session.close();await rm("build/library-saves",{recursive:true,force:true});}
const failed=results.filter(x=>x.status!=="PASS");console.log(JSON.stringify({total:results.length,pass:results.length-failed.length,fail:failed.length,results},null,2));if(failed.length)process.exitCode=1;
