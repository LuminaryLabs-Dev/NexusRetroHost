const MAX_BINARY = 128 * 1024 * 1024;
const toHex = bytes => Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");
const sha256 = async bytes => `sha256:${toHex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)))}`;

export class WasmEmulatorWorkerClient {
  constructor({ moduleUrl, wasmUrl, timeoutMs = 20000 } = {}) {
    this.moduleUrl = moduleUrl; this.wasmUrl = wasmUrl; this.timeoutMs = timeoutMs; this.module = null; this.identity = null; this.nextId = 1; this.tail = Promise.resolve(); this.disposed = false;
  }
  start() { this.startPromise ??= this.startWorker(); return this.startPromise; }
  async startWorker() {
    if (this.disposed) throw new Error("Worker disposed.");
    if (!this.moduleUrl || !this.wasmUrl) throw new Error("WASM worker URLs are required.");
    const [{ default: createRetroWorker }, wasmResponse] = await Promise.all([import(this.moduleUrl), fetch(this.wasmUrl)]);
    if (!wasmResponse.ok) throw new Error("Cannot load RetroHost WASM worker.");
    const wasmBinary = new Uint8Array(await wasmResponse.arrayBuffer());
    this.module = await createRetroWorker({ wasmBinary, noInitialRun: true });
    const response = await this.request("hello", { systemDirectory: "/", options: {} });
    this.identity = { ...response.result, coreHash: await sha256(wasmBinary) };
    return this.identity;
  }
  writeFile(path, bytes) {
    if (!this.module) throw new Error("Worker is not initialized.");
    const parts = path.split("/").filter(Boolean); let cursor = "";
    for (const part of parts.slice(0, -1)) { cursor += `/${part}`; try { this.module.FS.mkdir(cursor); } catch {} }
    this.module.FS.writeFile(path, new Uint8Array(bytes));
  }
  request(command, payload = {}, { sessionId = "", epoch = 0, binary = new Uint8Array() } = {}) {
    const run = async () => {
      if (!this.module || this.disposed) throw new Error("Worker is not running.");
      const data = binary instanceof Uint8Array ? binary : new Uint8Array(binary);
      if (data.byteLength > MAX_BINARY) throw new RangeError("Worker binary budget exceeded.");
      const pointer = data.byteLength ? this.module._malloc(data.byteLength) : 0;
      try {
        if (pointer) this.module.HEAPU8.set(data, pointer);
        const request = JSON.stringify({ protocolVersion: 1, requestId: this.nextId++, sessionId, epoch, command, payload, binaryLength: data.byteLength });
        const raw = this.module.ccall("nexusretro_dispatch", "string", ["string", "number", "number"], [request, pointer, data.byteLength]);
        const response = JSON.parse(raw);
        if (response.protocolVersion !== 1 || response.sessionId !== sessionId || response.epoch !== epoch) throw new Error("Stale or incompatible worker response.");
        if (response.ok !== true) throw new Error(response.error ?? "Worker operation failed.");
        const size = this.module.ccall("nexusretro_binary_size", "number", [], []);
        const outputPointer = this.module.ccall("nexusretro_binary_data", "number", [], []);
        const output = size ? Uint8Array.from(this.module.HEAPU8.subarray(outputPointer, outputPointer + size)) : new Uint8Array();
        return { ...response, binary: output };
      } finally { if (pointer) this.module._free(pointer); }
    };
    const promise = this.tail.then(() => Promise.race([run(), new Promise((_, reject) => setTimeout(() => reject(new Error("Worker request timed out.")), this.timeoutMs))]));
    this.tail = promise.catch(() => {}); return promise;
  }
  async close() { if (this.module && !this.disposed) { try { await this.request("close"); } finally { this.dispose(); } } }
  dispose() { this.disposed = true; this.module = null; }
}
