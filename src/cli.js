import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { createRetroEngine } from "./bootstrap.js";
import { RetroSession } from "./session-controller.js";
const [command = "help", ...args] = process.argv.slice(2);
const option = (name, fallback) => { const index = args.indexOf(`--${name}`); return index < 0 ? fallback : args[index + 1]; };
if (!["run", "corpus", "serve"].includes(command)) { console.log("Commands: run --rom FILE --core LIBRARY [--profile JSON] [--frames 120]; corpus --core LIBRARY [--report FILE]; serve --core LIBRARY [--system gb|snes] [--port 8080]. Build native worker first."); }
else {
  const corePath = option("core", process.env.RETRO_CORE); if (!corePath) throw new Error("Provide --core or RETRO_CORE.");
  const options = option("system", "gb") === "snes" ? {} : { sameboy_model: "Game Boy" };
  const engine = createRetroEngine({ worker: { executable: option("worker", "build/native/retro-worker"), corePath, options } });
  const session = new RetroSession(engine, { systems: option("system", "gb") === "snes" ? ["snes"] : ["gb", "gbc"], settings: options });
  if (command === "serve") { const { serve } = await import("./server.js"); await serve(session, Number(option("port", 8080))); }
  else {
    try {
      if (command === "run") {
        const profilePath = option("profile", null), profile = profilePath ? JSON.parse(await readFile(profilePath, "utf8")) : null;
        await session.load(option("rom"), profile); const frames = Number(option("frames", 120));
        if (!Number.isSafeInteger(frames) || frames < 1 || frames > 1000000) throw new Error("Invalid frame count.");
        for (let i = 0; i < frames; i++) await session.step();
        console.log(JSON.stringify({ sourceFrame: session.sourceFrame, state: engine.n.observationHistory.list({ limit: 600 }).at(-1), core: session.coreIdentity }, null, 2));
      } else {
        const manifest = JSON.parse(await readFile("tests/corpus/manifest.json", "utf8")), profile = JSON.parse(await readFile("profiles/gbmicrotest/profile.json", "utf8")), results = [];
        for (const entry of manifest.entries) { const verdict = await engine.n.romTests.run({ session, path: entry.path, profile, warmupFrames: 60 }); results.push({ id: entry.id, ...verdict }); console.error(`${verdict.status} ${entry.id}`); }
        const report = { schema: "nexusretro.corpus-report/1", core: session.coreIdentity, settings: options, sourceCommit: manifest.sourceCommit, results, counts: Object.fromEntries(["PASS", "FAIL", "TIMEOUT", "UNSUPPORTED", "HOST_ERROR"].map(status => [status, results.filter(result => result.status === status).length])) };
        const path = resolve(option("report", "reports/local/corpus.json")); await mkdir(dirname(path), { recursive: true }); await writeFile(path, JSON.stringify(report, null, 2) + "\n"); console.log(JSON.stringify(report.counts));
        if (report.counts.FAIL || report.counts.TIMEOUT || report.counts.UNSUPPORTED || report.counts.HOST_ERROR) process.exitCode = 1;
      }
    } finally { await session.close(); }
  }
}
