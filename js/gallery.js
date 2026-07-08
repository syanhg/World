// Catalog rendering plus the search/category filter controls that drive it.
import { state } from "./state.js";
import { escapeHtml, escapeAttribute, pickSpzUrl } from "./format.js";
import { PREVIEW_ORDER } from "./constants.js";
import { gallery, searchInput, searchButton, categorySelect, categoryGoButton } from "./dom.js";
import { openWorld } from "./viewer.js";
import { ensureMiniObserver, stopMiniViewer } from "./mini-viewer.js";

let activeFilter = "all";
let activeSearch = "";

function matchesFilter(world) {
  if (activeFilter === "all") return true;
  if (activeFilter === "public") return world.public;
  if (activeFilter === "private") return !world.public;
  return world.model === activeFilter;
}

function matchesSearch(world) {
  if (!activeSearch) return true;
  return `${world.title} ${world.prompt}`.toLowerCase().includes(activeSearch);
}

export function renderGallery() {
  const filtered = state.worlds.filter((world) => matchesFilter(world) && matchesSearch(world));

  gallery.querySelectorAll(".catalog-viewer").forEach((canvas) => stopMiniViewer(canvas));
  gallery.innerHTML = "";

  if (!filtered.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = `
      <h3>No Marble worlds loaded yet.</h3>
      <p>Generate a world with the World Labs API or load worlds created by your API key.</p>
    `;
    gallery.appendChild(empty);
    return;
  }

  filtered.forEach((world) => {
    const hasSplat = Boolean(pickSpzUrl(world.spzUrls, PREVIEW_ORDER));
    const article = document.createElement("article");
    article.className = "catalog-entry";
    article.innerHTML = `
      <button type="button" aria-label="Open ${escapeHtml(world.title)}">
        ${hasSplat ? `<canvas class="catalog-viewer" data-world-id="${escapeAttribute(world.id)}"></canvas>` : `<div class="missing-thumb">No 3D Yet</div>`}
        <div class="catalog-copy">
          <h3>${escapeHtml(world.title)}</h3>
          <span class="catalog-meta">${escapeHtml(world.model)} &middot; ${world.public ? "Public" : "Private"}</span>
        </div>
      </button>
    `;
    article.querySelector("button").addEventListener("click", () => openWorld(world));
    gallery.appendChild(article);

    if (hasSplat) {
      ensureMiniObserver().observe(article.querySelector(".catalog-viewer"));
    }
  });
}

function applyCategoryFilter() {
  activeFilter = categorySelect.value;
  renderGallery();
}

function applySearch() {
  activeSearch = searchInput.value.trim().toLowerCase();
  renderGallery();
}

categoryGoButton.addEventListener("click", applyCategoryFilter);
categorySelect.addEventListener("change", applyCategoryFilter);
searchButton.addEventListener("click", applySearch);
searchInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    applySearch();
  }
});
