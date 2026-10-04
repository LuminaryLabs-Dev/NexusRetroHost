import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { encodeWorkerPacket, createWorkerPacketDecoder } from "@luminarylabs/nexusengine-kits/native-emulator-worker-kit";

const commands=new Set(["initialize","hello","loadContent","step","reset","serialize","unserialize","readMemory","close"]);
export class NativeEmulatorWorkerClient {
  constructor(config={}){this.config={timeoutMs:20000,...config};this.pending=new Map();this.nextId=1;this.tail=Promise.resolve();this.child=null;this.disposed=false;this.identity=null;}
  start(){this.startPromise??=this.startWorker();return this.startPromise;}
  async startWorker(){
    if(this.disposed)throw new Error("Worker disposed.");
    const coreBytes=await readFile(this.config.corePath),coreHash=`sha256:${createHash("sha256").update(coreBytes).digest("hex")}`;
    const child=spawn(resolve(this.config.executable),[],{stdio:["pipe","pipe","pipe"],shell:false});this.child=child;
    const rejectAll=error=>{for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(error)}this.pending.clear();};
    const decode=createWorkerPacketDecoder(response=>{const p=this.pending.get(response.requestId);if(!p){this.dispose();return;}this.pending.delete(response.requestId);clearTimeout(p.timer);if(response.protocolVersion!==1||response.sessionId!==p.sessionId||response.epoch!==p.epoch)p.reject(new Error("Stale or incompatible worker response."));else if(response.ok!==true)p.reject(new Error(response.error??"Worker operation failed."));else p.resolve(response);});
    child.stdout.on("data",chunk=>{try{decode(chunk)}catch(error){this.dispose();rejectAll(error)}});
    child.stderr.on("data",chunk=>this.config.onLog?.(chunk.toString()));
    child.on("error",rejectAll);child.on("exit",(code,signal)=>rejectAll(new Error(`Worker exited (${code??signal}).`)));
    const response=await this.request("initialize",{corePath:resolve(this.config.corePath),options:this.config.options??{},systemDirectory:this.config.systemDirectory??process.cwd()});
    this.identity={...response.result,coreHash};return this.identity;
  }
  request(command,payload={}, {sessionId="",epoch=0,binary=Buffer.alloc(0)}={}){
    if(!commands.has(command))return Promise.reject(new TypeError("Unknown worker command."));
    const run=()=>new Promise((resolveResult,reject)=>{if(!this.child||this.disposed){reject(new Error("Worker is not running."));return;}const requestId=this.nextId++,packet=encodeWorkerPacket({protocolVersion:1,requestId,sessionId,epoch,command,payload},binary),timer=setTimeout(()=>{this.dispose();reject(new Error("Worker request timed out."));},this.config.timeoutMs);this.pending.set(requestId,{resolve:resolveResult,reject,timer,sessionId,epoch});this.child.stdin.write(packet);});
    const promise=this.tail.then(run);this.tail=promise.catch(()=>{});return promise;
  }
  async close(){try{if(this.child&&!this.disposed)await this.request("close");}finally{this.dispose();}}
  dispose(){this.disposed=true;this.child?.kill();for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(new Error("Worker disposed."));}this.pending.clear();}
}
