import { observationDigest } from "nexusengine/domains/runtime/data/observation";
import { validateGameProfile, decodeGameProfile } from "@luminarylabs/nexusengine-kits/observed-game-state-adapter-kit";
import { putSave, getSave } from "./save-store.js";

const snapshotDomains=["data","observationHistory","persistence","transaction","simulation","actor","creature","character","player","spatial","input","asset","diagnostics","presentationOutput","audio"];
const hex=bytes=>Array.from(bytes,v=>v.toString(16).padStart(2,"0")).join("");
const hash=async bytes=>`sha256:${hex(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)))}`;
const safeName=name=>(name||"content.gb").replace(/[^a-zA-Z0-9._-]/g,"_");
const bytesOf=value=>value instanceof Uint8Array?value:new Uint8Array(value);

export class BrowserRetroSession {
  constructor(engine,{settings={}}={}) {
    this.engine=engine;this.settings=settings;this.settingsHash=observationDigest(settings);this.sessionId=crypto.randomUUID();
    this.epoch=0;this.sourceFrame=0;this.status="empty";this.lastFrame=null;this.profile=null;this.profileHash=null;this.checkpoints=[];this.inputLog=new Map();this.tail=Promise.resolve();
  }
  identity(){return{sessionId:this.sessionId,epoch:this.epoch};}
  exclusive(work){const p=this.tail.then(work);this.tail=p.catch(()=>{});return p;}
  getCoreSnapshots(){return Object.fromEntries(snapshotDomains.filter(k=>this.engine.n[k]?.getSnapshot).map(k=>[k,this.engine.n[k].getSnapshot()]));}
  loadCoreSnapshots(snapshots){for(const key of snapshotDomains)if(key!=="transaction"&&snapshots[key]&&this.engine.n[key]?.loadSnapshot)this.engine.n[key].loadSnapshot(snapshots[key]);}
  async load(name,input,profile=null){
    return this.exclusive(async()=>{
      this.status="loading";
      const data=bytesOf(input),extension=(name.match(/\.(gbc?|GB[C]?)$/)?.[0]??"").toLowerCase();
      if(![".gb",".gbc"].includes(extension)||data.byteLength<0x150||data.byteLength>128*1024*1024)throw new Error("Only valid GB/GBC content is supported by the web target.");
      const contentHash=await hash(data);
      if(profile){validateGameProfile(profile);if(!profile.contentHashes.includes(contentHash))profile=null;}
      const path=`/roms/${safeName(name)}`; const client=this.engine.n.emulatorWorker.client;
      await client.start();client.writeFile(path,data);
      const identity=await this.engine.n.emulatorProvider.start();this.epoch++;
      const response=await this.engine.n.emulatorProvider.loadContent({path},this.identity());
      for(const key of ["simulation","actor","creature","character","player","spatial","diagnostics"])this.engine.n[key]?.reset?.();
      this.engine.n.simulation.resetResolution();this.engine.n.observationHistory.reset();
      this.engine.n.asset.registerAsset({id:contentHash,kind:"rom",contentHash,source:{uri:`nexusretro:${encodeURIComponent(name)}`},metadata:{system:extension===".gbc"?"gbc":"gb",bytes:data.byteLength}});
      this.content={name,path,contentHash,system:extension===".gbc"?"gbc":"gb",bytes:data.byteLength};this.coreIdentity=identity;this.profile=profile;this.profileHash=profile?observationDigest(profile):null;
      this.sourceFrame=0;this.lastFrame=null;this.status="paused";this.timing=response.result;this.checkpoints=[];this.inputLog.clear();
      return{content:this.content,core:identity,semanticState:profile?"profiled":"unavailable"};
    });
  }
  async drive(actions=[]){
    const identity=this.identity(),buttons=this.engine.n.consoleInput.encode(actions);
    const receipt=await this.engine.n.emulatorProvider.step({buttons,memoryRanges:this.profile?.memoryRanges??[]},identity);
    if(receipt.epoch!==this.epoch||receipt.sessionId!==this.sessionId||receipt.result.sourceFrame!==this.sourceFrame+1)throw new Error("Out-of-order emulator frame.");
    const segments=this.engine.n.emulatorMemory.extract(receipt),decoded=this.profile?decodeGameProfile(this.profile,segments,this.content.contentHash):[];
    const payloads={};for(const [id,data]of segments)payloads[id]={bytes:data.byteLength,hash:await hash(data)};
    const metadata={id:`${this.sessionId}:${this.epoch}:${receipt.result.sourceFrame}`,sessionId:this.sessionId,epoch:this.epoch,sourceFrame:receipt.result.sourceFrame,contentHash:this.content.contentHash,coreHash:this.coreIdentity.coreHash,settingsHash:this.settingsHash,profileHash:this.profileHash,inputPacket:buttons,payloads,decoded};
    this.engine.n.observedGameState.stage(metadata);
    try{this.engine.tick(1/receipt.result.fps);this.engine.n.observedGameState.finish();}catch(error){this.engine.n.observedGameState.abort();this.status="error";throw error;}
    this.sourceFrame=receipt.result.sourceFrame;return{...metadata,...receipt.result,segments,nexusCommit:this.engine.getLastTickCommit()};
  }
  async step(actions=[]){return this.exclusive(async()=>{if(!["paused","running"].includes(this.status))throw new Error("Session is not ready.");this.lastFrame=await this.drive(actions);this.inputLog.set(this.sourceFrame,[...actions]);if(this.sourceFrame===1||this.sourceFrame%60===0)await this.checkpoint();return this.lastFrame;});}
  run(){if(this.status!=="paused")throw new Error("Session must be paused.");this.status="running";}
  pause(){if(this.status==="running")this.status="paused";}
  async reset(){return this.exclusive(async()=>{if(!["paused","running"].includes(this.status))throw new Error("No active content.");this.epoch++;await this.engine.n.emulatorProvider.reset(this.identity());for(const key of["simulation","actor","creature","character","player","spatial","diagnostics"])this.engine.n[key]?.reset?.();this.engine.n.simulation.resetResolution();this.sourceFrame=0;this.lastFrame=null;this.status="paused";this.checkpoints=[];this.inputLog.clear();});}
  async save(slot="browser"){return this.exclusive(async()=>{if(!["paused","running"].includes(this.status))throw new Error("Session not ready.");this.status="paused";const state=await this.engine.n.emulatorProvider.serialize(this.identity());const value={binary:state.binary,metadata:{contentHash:this.content.contentHash,coreHash:this.coreIdentity.coreHash,profileHash:this.profileHash,settingsHash:this.settingsHash,sourceFrame:this.sourceFrame,epoch:this.epoch,sessionId:this.sessionId,input:this.lastFrame?.inputPacket??[0],domains:this.getCoreSnapshots()}};await putSave(slot,value);return value.metadata;});}
  async restore(slot="browser"){return this.exclusive(async()=>{if(!["paused","running"].includes(this.status))throw new Error("Load compatible content before restore.");this.status="paused";const bundle=await getSave(slot);if(!bundle)throw new Error("Save slot is empty.");for(const key of["contentHash","coreHash","profileHash","settingsHash"]){const current={contentHash:this.content.contentHash,coreHash:this.coreIdentity.coreHash,profileHash:this.profileHash,settingsHash:this.settingsHash};if(bundle.metadata[key]!==current[key])throw new Error(`Save ${key} mismatch.`);}this.epoch++;await this.engine.n.emulatorProvider.unserialize({sourceFrame:bundle.metadata.sourceFrame},{...this.identity(),binary:bytesOf(bundle.binary)});this.loadCoreSnapshots(bundle.metadata.domains);this.sourceFrame=bundle.metadata.sourceFrame;this.lastFrame=null;this.checkpoints=[];this.inputLog.clear();await this.checkpoint();return{sourceFrame:this.sourceFrame,epoch:this.epoch};});}
  async checkpoint(){const state=await this.engine.n.emulatorProvider.serialize(this.identity()),domains=this.getCoreSnapshots(),bytes=state.binary.byteLength+new TextEncoder().encode(JSON.stringify(domains)).byteLength;if(bytes>128*1024*1024)throw new Error("Checkpoint exceeds memory budget.");this.checkpoints.push({frame:this.sourceFrame,binary:Uint8Array.from(state.binary),domains,bytes});while(this.checkpoints.length>11||this.checkpoints.reduce((n,c)=>n+c.bytes,0)>128*1024*1024)this.checkpoints.shift();}
  async rewind(frame){return this.exclusive(async()=>{if(!Number.isSafeInteger(frame)||frame<0||frame>this.sourceFrame)throw new Error("Invalid rewind target.");const checkpoint=[...this.checkpoints].reverse().find(c=>c.frame<=frame);if(!checkpoint)throw new Error("Rewind target was evicted.");const inputs=[];for(let f=checkpoint.frame+1;f<=frame;f++){if(!this.inputLog.has(f))throw new Error("Replay input was evicted.");inputs.push(this.inputLog.get(f));}this.status="paused";this.epoch++;await this.engine.n.emulatorProvider.unserialize({sourceFrame:checkpoint.frame},{...this.identity(),binary:checkpoint.binary});this.loadCoreSnapshots(checkpoint.domains);this.sourceFrame=checkpoint.frame;this.lastFrame=null;for(const actions of inputs)this.lastFrame=await this.drive(actions);this.checkpoints=this.checkpoints.filter(c=>c.frame<=frame);for(const f of this.inputLog.keys())if(f>frame)this.inputLog.delete(f);return{sourceFrame:this.sourceFrame,epoch:this.epoch};});}
  inspect(){return{status:this.status,sourceFrame:this.sourceFrame,semanticState:this.profile?"profiled":"unavailable",content:this.content,history:this.engine.n.observationHistory.list({limit:10}),domains:this.getCoreSnapshots()};}
  async close(){this.status="closed";this.engine.n.observedGameState.dispose();await this.engine.n.emulatorProvider.close();}
}
