import { createHash } from "node:crypto";
import { decodeGameProfile } from "@luminarylabs/nexusengine-kits/observed-game-state-adapter-kit";
export async function driveFrame(session, actions) {
  const identity = session.identity(), buttons = session.engine.n.consoleInput.encode(actions);
  const receipt = await session.engine.n.emulatorProvider.step({ buttons, memoryRanges: session.profile?.memoryRanges ?? [] }, identity);
  if (receipt.epoch !== session.epoch || receipt.sessionId !== session.sessionId || receipt.result.sourceFrame !== session.sourceFrame + 1) throw new Error("Out-of-order emulator frame.");
  const segments = session.engine.n.emulatorMemory.extract(receipt);
  const decoded = session.profile ? decodeGameProfile(session.profile, segments, session.content.contentHash) : [];
  const metadata = {
    id: `${session.sessionId}:${session.epoch}:${receipt.result.sourceFrame}`,
    sessionId: session.sessionId, epoch: session.epoch, sourceFrame: receipt.result.sourceFrame,
    contentHash: session.content.contentHash, coreHash: session.coreIdentity.coreHash,
    settingsHash: session.settingsHash, profileHash: session.profileHash, inputPacket: buttons,
    payloads: Object.fromEntries([...segments].map(([id, bytes]) => [id, { bytes: bytes.byteLength, hash: `sha256:${createHash("sha256").update(bytes).digest("hex")}` }])), decoded
  };
  session.engine.n.observedGameState.stage(metadata);
  try { session.engine.tick(1 / receipt.result.fps); session.engine.n.observedGameState.finish(); }
  catch (error) { session.engine.n.observedGameState.abort(); session.status = "error"; throw error; }
  session.sourceFrame = receipt.result.sourceFrame;
  return { ...metadata, ...receipt.result, segments, nexusCommit: session.engine.getLastTickCommit() };
}
