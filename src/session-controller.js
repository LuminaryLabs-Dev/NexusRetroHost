import { randomUUID } from "node:crypto";
import { observationDigest } from "nexusengine/domains/runtime/data/observation";
import { validateGameProfile } from "@luminarylabs/nexusengine-kits/observed-game-state-adapter-kit";
import { selectCore } from "./core-selection.js";
import { driveFrame } from "./frame-driver.js";

const snapshotDomains = ["data", "observationHistory", "persistence", "transaction", "simulation", "actor", "creature", "character", "player", "spatial", "input", "asset", "diagnostics", "presentationOutput", "audio"];
export class RetroSession {
  constructor(engine, { systems = ["gb", "gbc"], settings = {} } = {}) {
    this.engine = engine; this.systems = systems; this.settings = settings; this.settingsHash = observationDigest(settings);
    this.sessionId = randomUUID(); this.epoch = 0; this.sourceFrame = 0; this.status = "empty"; this.tail = Promise.resolve(); this.operation = 0; this.lastFrame = null; this.checkpoints = []; this.inputLog = new Map();
  }
  identity() { return { sessionId: this.sessionId, epoch: this.epoch }; }
  exclusive(work) { const promise = this.tail.then(work); this.tail = promise.catch(() => {}); return promise; }
  async operationSequence(name, work) {
    const id = `retro-${name}-${++this.operation}`, event = `${id}-done`, sequence = this.engine.n.sequence;
    sequence.mountNode({ id, type: "flow", completionMode: "sequence", children: [{ id: `${id}-wait`, type: "waitForEvent", completionMode: "event", listen: [event] }] }); sequence.startNode(id);
    try { const result = await work(); sequence.dispatchNodeEvent(event, { operation: name, outcome: "complete" }); return result; }
    finally { sequence.getNodeRuntime().unmount(id); }
  }
  executeOnce(command, operationId, request, operation) {
    if (!["load","reset","save","restore","rewind"].includes(command) || typeof operationId !== "string" || !operationId || operationId.length>128 || typeof operation!=="function") return Promise.reject(new TypeError("Invalid lifecycle operation."));
    const work=async()=>{
      const ledger=this.engine.n.transaction, input={command,...request}, existing=ledger.get("retro-lifecycle",operationId);
      if(existing)return ledger.record("retro-lifecycle",operationId,existing.result,{},input).record.result;
      await operation();const result={sourceFrame:this.sourceFrame,epoch:this.epoch,status:this.status};
      ledger.record("retro-lifecycle",operationId,result,{},input);return result;
    };
    this.commandTail??=Promise.resolve();const result=this.commandTail.then(work);this.commandTail=result.catch(()=>{});return result;
  }
  getCoreSnapshots() { return Object.fromEntries(snapshotDomains.filter(key => this.engine.n[key]?.getSnapshot).map(key => [key, this.engine.n[key].getSnapshot()])); }
  loadCoreSnapshots(snapshots) { for (const key of snapshotDomains) if (key !== "transaction" && snapshots[key] && this.engine.n[key]?.loadSnapshot) this.engine.n[key].loadSnapshot(snapshots[key]); }
  async load(path, profile = null) {
    return this.exclusive(() => this.operationSequence("load", async () => {
      this.status = "loading";
      try {
        const content = await this.engine.n.nintendoContent.load(path);
        selectCore(content.system, [{ systems: this.systems }]);
        if (profile) { validateGameProfile(profile); if (profile.memoryRanges.length>256 || profile.memoryRanges.some(range=>["video","audio"].includes(range.id))) throw new TypeError("Profile ranges exceed worker constraints or use a reserved payload identity."); }
        if (profile && !profile.contentHashes?.includes(content.contentHash)) throw new Error("Profile does not match content.");
        this.coreIdentity = await this.engine.n.emulatorProvider.start(); this.epoch++;
        const response = await this.engine.n.emulatorProvider.loadContent({ path: content.path }, this.identity());
        // Clear active observed domains only after the worker accepted the content.
        for (const key of ["simulation", "actor", "creature", "character", "player", "spatial", "diagnostics"]) this.engine.n[key]?.reset?.();
        this.engine.n.simulation.resetResolution(); this.engine.n.observationHistory.reset();
        this.content = content; this.profile = profile; this.profileHash = profile ? observationDigest(profile) : null;
        this.sourceFrame = 0; this.lastFrame = null; this.status = "paused"; this.timing = response.result;
        this.checkpoints = []; this.inputLog.clear();
        return { content, core: this.coreIdentity, semanticState: profile ? "profiled" : "unavailable" };
      } catch (error) { this.status = "error"; throw error; }
    }));
  }
  async step(actions = []) {
    return this.exclusive(async () => {
      if (!["paused", "running"].includes(this.status)) throw new Error("Session is not ready to step.");
      try { this.lastFrame = await driveFrame(this, actions); this.inputLog.set(this.sourceFrame, [...actions]); if (this.sourceFrame === 1 || this.sourceFrame % 60 === 0) await this.checkpoint(); return this.lastFrame; }
      catch (error) { this.status = "error"; throw error; }
    });
  }
  run() { if (this.status !== "paused") throw new Error("Session must be paused before run."); this.status = "running"; }
  pause() { if (this.status === "running") this.status = "paused"; }
  async reset() { return this.exclusive(() => this.operationSequence("reset", async () => {
    if (!["paused", "running"].includes(this.status)) throw new Error("No active content.");
    this.epoch++; try { await this.engine.n.emulatorProvider.reset(this.identity()); } catch(error) { this.status="error"; throw error; }
    for (const key of ["simulation", "actor", "creature", "character", "player", "spatial", "diagnostics"]) this.engine.n[key]?.reset?.();
    this.engine.n.simulation.resetResolution(); this.sourceFrame = 0; this.status = "paused"; this.lastFrame = null; this.checkpoints=[]; this.inputLog.clear();
  })); }
  async save(path) { return this.exclusive(() => this.operationSequence("save", async () => {
    if (!["paused", "running"].includes(this.status)) throw new Error("Session not ready to save.");
    this.status = "paused"; const state = await this.engine.n.emulatorProvider.serialize(this.identity());
    return this.engine.n.snapshotFiles.save(path, { binary: state.binary, metadata: { contentHash: this.content.contentHash, coreHash: this.coreIdentity.coreHash, profileHash: this.profileHash, settingsHash: this.settingsHash, sourceFrame: this.sourceFrame, epoch: this.epoch, sessionId: this.sessionId, input: this.lastFrame?.inputPacket ?? [0], domains: this.getCoreSnapshots() } });
  })); }
  async restore(path) { return this.exclusive(() => this.operationSequence("restore", async () => {
    if (!["paused", "running"].includes(this.status)) throw new Error("Load compatible content before restore.");
    this.status = "paused"; const bundle = await this.engine.n.snapshotFiles.load(path);
    for (const key of ["contentHash", "coreHash", "profileHash", "settingsHash"]) {
      const current = { contentHash: this.content.contentHash, coreHash: this.coreIdentity.coreHash, profileHash: this.profileHash, settingsHash: this.settingsHash };
      if (bundle.metadata[key] !== current[key]) throw new Error(`Save ${key} mismatch.`);
    }
    if (!Number.isSafeInteger(bundle.metadata.sourceFrame) || bundle.metadata.sourceFrame<0 || !bundle.metadata.domains || typeof bundle.metadata.domains!=="object") throw new TypeError("Invalid saved frame or domain snapshots.");
    // Save rollback state before changing the provider or any Core owner.
    const previous = await this.engine.n.emulatorProvider.serialize(this.identity()), domains = this.getCoreSnapshots(), frame = this.sourceFrame;
    this.epoch++;
    try {
      await this.engine.n.emulatorProvider.unserialize({ sourceFrame: bundle.metadata.sourceFrame }, { ...this.identity(), binary: bundle.binary });
      this.engine.world.atomic(() => this.loadCoreSnapshots(bundle.metadata.domains));
      this.sourceFrame = bundle.metadata.sourceFrame; this.lastFrame = null; this.checkpoints=[]; this.inputLog.clear(); await this.checkpoint();
    } catch (error) {
      this.epoch++;
      try { await this.engine.n.emulatorProvider.unserialize({ sourceFrame: frame }, { ...this.identity(), binary: previous.binary }); this.engine.world.atomic(() => this.loadCoreSnapshots(domains)); }
      catch (rollbackError) { this.status = "error"; throw new AggregateError([error, rollbackError], "Save recovery failed."); }
      throw error;
    }
  })); }
  async checkpoint() {
    const state = await this.engine.n.emulatorProvider.serialize(this.identity()), domains = this.getCoreSnapshots();
    const bytes = state.binary.length + Buffer.byteLength(JSON.stringify(domains));
    if (bytes > 128 * 1024 * 1024) throw new Error("Checkpoint exceeds memory budget.");
    this.checkpoints.push({ frame: this.sourceFrame, binary: state.binary, domains, bytes });
    while (this.checkpoints.length > 11 || this.checkpoints.reduce((n,c)=>n+c.bytes,0)>128*1024*1024) this.checkpoints.shift();
    const first=this.checkpoints[0]?.frame??this.sourceFrame;for(const frame of this.inputLog.keys())if(frame<=first)this.inputLog.delete(frame);
  }
  async rewind(frame) { return this.exclusive(() => this.operationSequence("rewind", async () => {
    if (!Number.isSafeInteger(frame) || frame < 0 || frame > this.sourceFrame || !["paused","running"].includes(this.status)) throw new Error("Invalid rewind target.");
    const checkpoint=this.checkpoints.findLast(c=>c.frame<=frame);if(!checkpoint)throw new Error("Rewind target was evicted.");
    const inputs=[];for(let f=checkpoint.frame+1;f<=frame;f++){if(!this.inputLog.has(f))throw new Error("Replay input was evicted.");inputs.push(this.inputLog.get(f));}
    this.status="paused";this.epoch++;
    try {
      await this.engine.n.emulatorProvider.unserialize({sourceFrame:checkpoint.frame},{...this.identity(),binary:checkpoint.binary});
      this.loadCoreSnapshots(checkpoint.domains);this.sourceFrame=checkpoint.frame;this.lastFrame=null;
      for(const actions of inputs)this.lastFrame=await driveFrame(this,actions);
      this.checkpoints=this.checkpoints.filter(c=>c.frame<=frame);for(const f of this.inputLog.keys())if(f>frame)this.inputLog.delete(f);
      return {sourceFrame:this.sourceFrame,epoch:this.epoch};
    }catch(error){this.status="error";throw error;}
  })); }
  async close() { return this.exclusive(async () => { this.status = "closed"; this.engine.n.observedGameState.dispose(); await this.engine.n.emulatorProvider.close(); }); }
}
