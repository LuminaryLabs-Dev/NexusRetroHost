import { createRomLibrary } from "./rom-library.js";
const $ = id => document.getElementById(id);
async function getJSON(path) {
  const response = await fetch(new URL(path, document.baseURI));
  if (!response.ok) throw new Error("Unable to fetch " + path + " (HTTP " + response.status + ").");
  return response.json();
}
async function start() {
  const paths = await getJSON("./games/manifest-index.json");
  if (!Array.isArray(paths) || paths.length !== 50 ||
    paths.some(p => !/^games\/manifests\/[a-z0-9._-]+\.json$/.test(p))) {
    throw new Error("Expected 50 approved game manifests.");
  }
  const catalog = await Promise.all(paths.map(p => getJSON("./" + p)));
  catalog.sort((a,b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
  createRomLibrary({ catalog, container: $("library"), search: $("library-search"),
    count: $("library-count"), catalogBase: new URL("./games/", document.baseURI), canPlay: false });
}
start().catch(error => {
  $("library-count").textContent = "Game catalog unavailable";
  $("status").textContent = error.message; $("status").className = "error";
  console.error(error);
});
