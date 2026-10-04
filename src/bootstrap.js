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
import { createNativeEmulatorWorkerKit } from "@luminarylabs/nexusengine-kits/native-emulator-worker-kit";
import { createLibretroProviderKit } from "@luminarylabs/nexusengine-kits/libretro-provider-kit";
import { createNintendoContentLoaderKit } from "@luminarylabs/nexusengine-kits/nintendo-content-loader-kit";
import { createEmulatorMemoryObserverKit } from "@luminarylabs/nexusengine-kits/emulator-memory-observer-kit";
import { createObservedGameStateAdapterKit } from "@luminarylabs/nexusengine-kits/observed-game-state-adapter-kit";
import { createConsoleInputAdapterKit } from "@luminarylabs/nexusengine-kits/console-input-adapter-kit";
import { createFilesystemSnapshotAdapterKit } from "@luminarylabs/nexusengine-kits/filesystem-snapshot-adapter-kit";
import { createRasterFrameProviderKit } from "@luminarylabs/nexusengine-kits/raster-frame-provider-kit";
import { createPcmAudioProviderKit } from "@luminarylabs/nexusengine-kits/pcm-audio-provider-kit";
import { createRomTestRunnerKit } from "@luminarylabs/nexusengine-kits/rom-test-runner-kit";

export function createRetroEngine(config) {
  return createEngine({ kits: [
    createHostCapabilityKit(), createDataKit(), createObservationHistoryKit({ retention: config.retention ?? { maxFrames: 600, maxBytes: 64 * 1024 * 1024 } }),
    createPersistenceKit(), createTransactionLedgerKit(), createSimulationKit({ resolution: true }),
    createActorRegistryKit(), createCreatureKit(), createCharacterKit(), createPlayerKit(), createSpatialKit(), createInputKit(),
    createAssetRegistryKit(), createDiagnosticsKit(), createPresentationKit(), createPresentationOutputKit(), createAudioKit(),
    createNativeEmulatorWorkerKit(config.worker), createLibretroProviderKit(), createNintendoContentLoaderKit(), createEmulatorMemoryObserverKit(),
    createObservedGameStateAdapterKit(), createConsoleInputAdapterKit(), createFilesystemSnapshotAdapterKit(), createRasterFrameProviderKit(), createPcmAudioProviderKit(), createRomTestRunnerKit()
  ] });
}
