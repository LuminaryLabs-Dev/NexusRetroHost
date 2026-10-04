import { defineDomainServiceKit } from "nexusengine/domain-service-kit";

export function createEmulatorWorkerKit({ client, target = "native" } = {}) {
  if (!client || typeof client.start !== "function" || typeof client.request !== "function") throw new TypeError("EmulatorWorkerKit requires a worker client.");
  return defineDomainServiceKit({
    id: "nexusretro-emulator-worker-kit",
    domain: "emulator-worker",
    domainPath: "n:host:extensions:emulator-worker",
    parentDomainPath: "n:host:extensions",
    apiName: "emulatorWorker",
    version: "0.2.0",
    stability: "candidate",
    services: ["adapter"],
    provides: ["emulation:worker"],
    metadata: { purpose: "Single RetroHost worker boundary; build target selects native or WebAssembly transport.", target },
    createApi() { return { client, target }; }
  });
}
