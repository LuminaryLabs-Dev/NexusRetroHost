import { createHostCapabilityKit } from "nexusengine/domains/host/capabilities";
import { createEngine } from "nexusengine";
import { createDataKit } from "nexusengine/domains/runtime/data";
import { createObservationHistoryKit } from "nexusengine/domains/runtime/data/observation";
import { createPersistenceKit } from "nexusengine/domains/runtime/persistence";
import { createTransactionLedgerKit } from "nexusengine/domains/runtime/transaction";
import { createSimulationKit } from "nexusengine/domains/simulation/runtime";
import { createActorRegistryKit } from "nexusengine/domains/actor/registry";
import { createCreatureKit } from "nexusengine/domains/actor/creature";
import { createCharacterKit } from "nexusengine/domains/actor/character";
import { createPlayerKit } from "nexusengine/domains/actor/player";
import { createSpatialKit } from "nexusengine/domains/spatial/contracts";
import { createInputKit } from "nexusengine/domains/interaction/input";
import { createAssetRegistryKit } from "nexusengine/domains/asset/registry";
import { createDiagnosticsKit } from "nexusengine/domains/diagnostics/runtime";
import { createPresentationKit } from "nexusengine/domains/presentation/registry";
import { createPresentationOutputKit } from "nexusengine/domains/presentation/output";
import { createAudioKit } from "nexusengine/domains/presentation/audio";
import { createLibretroProviderKit } from "@luminarylabs/nexusengine-kits/libretro-provider-kit";
import { createEmulatorMemoryObserverKit } from "@luminarylabs/nexusengine-kits/emulator-memory-observer-kit";
import { createObservedGameStateAdapterKit } from "@luminarylabs/nexusengine-kits/observed-game-state-adapter-kit";
import { createConsoleInputAdapterKit } from "@luminarylabs/nexusengine-kits/console-input-adapter-kit";
import { createRasterFrameProviderKit } from "@luminarylabs/nexusengine-kits/raster-frame-provider-kit";
import { createPcmAudioProviderKit } from "@luminarylabs/nexusengine-kits/pcm-audio-provider-kit";
import { createEmulatorWorkerKit } from "../adapters/emulator-worker-kit.js";
import { WasmEmulatorWorkerClient } from "../adapters/wasm-worker-client.js";

export function createBrowserRetroEngine(config = {}) {
  const client = config.workerClient ?? new WasmEmulatorWorkerClient({
    moduleUrl: config.moduleUrl ?? new URL("../../worker/retro-worker.js", import.meta.url).href,
    wasmUrl: config.wasmUrl ?? new URL("../../worker/retro-worker.wasm", import.meta.url).href
  });
  const engine = createEngine({ kits: [
    createHostCapabilityKit(), createDataKit(),
    createObservationHistoryKit({ retention: config.retention ?? { maxFrames: 600, maxBytes: 64 * 1024 * 1024 } }),
    createPersistenceKit(), createTransactionLedgerKit(), createSimulationKit({ resolution: true }),
    createActorRegistryKit(), createCreatureKit(), createCharacterKit(), createPlayerKit(), createSpatialKit(), createInputKit(),
    createAssetRegistryKit(), createDiagnosticsKit(), createPresentationKit(), createPresentationOutputKit(), createAudioKit(),
    createEmulatorWorkerKit({ client, target: "wasm" }), createLibretroProviderKit(), createEmulatorMemoryObserverKit(),
    createObservedGameStateAdapterKit(), createConsoleInputAdapterKit(), createRasterFrameProviderKit(), createPcmAudioProviderKit()
  ] });
  return engine;
}
