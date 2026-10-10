/** Render only catalog-listed GB/GBC ROMs, preserving title and license metadata. */
export function createRomLibrary({ catalog, container, search, count, catalogBase, onPlay = () => {}, canPlay = true }) {
  const entries = catalog.filter(game => /^roms\/[a-zA-Z0-9._-]+\.gbc?$/.test(game?.content?.path || "") &&
    game.content.filename === game.content.path.split("/").at(-1));
  function render() {
    const q = search.value.trim().toLowerCase();
    const filtered = entries.filter(game => [game.title, game.developer, game.system].some(value =>
      String(value || "").toLowerCase().includes(q)));
    count.textContent = q ? filtered.length + " of " + entries.length + " redistributable games"
      : entries.length + " bundled redistributable Game Boy / Game Boy Color games";
    container.replaceChildren(...filtered.map(game => {
      const card = document.createElement("article"); card.className = "game-entry"; card.dataset.id = game.id;
      const heading = document.createElement("strong"); heading.textContent = game.title;
      const details = document.createElement("span"); details.className = "game-info";
      details.textContent = game.system.toUpperCase() + " · " + game.license + (game.developer ? " · " + game.developer : "");
      const actions = document.createElement("div"); actions.className = "game-actions";
      const play = document.createElement("button"); play.className = "game-card";
      play.type = "button"; play.textContent = "Play"; play.disabled = !canPlay;
      play.title = canPlay ? "Play in browser" : "Requires compiled WebAssembly emulator";
      play.addEventListener("click", () => { if (canPlay) onPlay(game); });
      const download = document.createElement("a"); download.className = "download-rom";
      download.href = new URL(game.content.path, catalogBase).href;
      download.download = game.content.filename;
      download.textContent = "Download ROM"; download.setAttribute("aria-label", "Download " + game.title + " ROM");
      actions.append(play, download); card.append(heading, details, actions); return card;
    }));
    if (!filtered.length) container.textContent = "No games match your search.";
  }
  search.addEventListener("input", render); render();
}
