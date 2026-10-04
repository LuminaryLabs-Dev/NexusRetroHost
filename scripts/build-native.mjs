import { spawnSync } from "node:child_process";
const cmake = process.env.CMAKE ?? "cmake";
for (const args of [["-S", "native/retro-worker", "-B", "build/native", "-DCMAKE_BUILD_TYPE=Release"], ["--build", "build/native", "--config", "Release", "-j2"]]) {
  const result = spawnSync(cmake, args, { stdio: "inherit", shell: false }); if (result.error) throw result.error; if (result.status !== 0) process.exit(result.status ?? 1);
}
