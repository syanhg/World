const WORLD_LABS_API = "https://api.worldlabs.ai/marble/v1";
const STORAGE_KEY = "marbleboard-api-worlds";
const API_KEY_STORAGE_KEY = "marbleboard-api-key";

const prompts = [
  "A marble quarry city at dusk, red lanterns, navigable stairways, hidden observatory",
  "A flooded library world with rowing paths between shelves and glowing catalog towers",
  "A cliffside tea market built into giant basalt columns, mist, cable bridges",
  "A quiet desert observatory where mirrors bloom from the sand after sunset"
];

const gallery = document.querySelector("#gallery");
const form = document.querySelector("#worldForm");
const apiKeyInput = document.querySelector("#apiKey");
const promptInput = document.querySelector("#prompt");
const modelInput = document.querySelector("#model");
const displayNameInput = document.querySelector("#displayName");
const publicWorldInput = document.querySelector("#publicWorld");
const loadWorldsButton = document.querySelector("#loadWorldsButton");
const progressBar = document.querySelector("#progressBar");
const statusTitle = document.querySelector("#statusTitle");
const statusText = document.querySelector("#statusText");
const modal = document.querySelector("#worldModal");
const drawer = document.querySelector("#drawer");
const previewImage = document.querySelector("#worldPreview");

let worlds = loadStoredWorlds();
let activeFilter = "all";
let activeWorld = worlds[0] || null;
let pollTimer = null;

function loadStoredWorlds() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveStoredWorlds() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(worlds));
}

function getApiKey() {
  return apiKeyInput.value.trim();
}

function rememberApiKey() {
  const key = getApiKey();
  if (key) {
    localStorage.setItem(API_KEY_STORAGE_KEY, key);
  }
  return key;
}

function restoreApiKey() {
  apiKeyInput.value = localStorage.getItem(API_KEY_STORAGE_KEY) || "";
}

function forgetApiKey() {
  localStorage.removeItem(API_KEY_STORAGE_KEY);
  apiKeyInput.value = "";
  setStatus("Key Forgotten", "Your saved World Labs API key was removed from this browser.", 0);
}

async function worldLabsFetch(path, options = {}) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("Add a World Labs API key first.");
  }

  const response = await fetch(`${WORLD_LABS_API}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "WLT-Api-Key": apiKey,
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }
  }

  if (!response.ok) {
    const message = data?.detail?.[0]?.msg || data?.error?.message || data?.message || `World Labs API returned ${response.status}`;
    throw new Error(message);
  }

  return data;
}

function titleFromPrompt(prompt) {
  const words = prompt.replace(/[^a-z0-9 ]/gi, "").split(" ").filter(Boolean);
  const picked = words.filter((word) => word.length > 3).slice(0, 2);
  return picked.length ? picked.map((word) => word[0].toUpperCase() + word.slice(1)).join(" ") : "Untitled World";
}

function normalizeWorld(world) {
  const assets = world.assets || {};
  const prompt = world.world_prompt?.text_prompt || world.prompt || assets.caption || "";
  const marbleUrl = world.world_marble_url || (world.world_id || world.id ? `https://marble.worldlabs.ai/world/${world.world_id || world.id}` : "");

  return {
    id: world.world_id || world.id || crypto.randomUUID(),
    title: world.display_name || titleFromPrompt(prompt),
    prompt,
    model: world.model || "marble",
    status: world.status || "SUCCEEDED",
    public: Boolean(world.permission?.public),
    marbleUrl,
    thumbnailUrl: assets.thumbnail_url || "",
    panoUrl: assets.imagery?.pano_url || "",
    colliderMeshUrl: assets.mesh?.collider_mesh_url || "",
    spzUrls: assets.splats?.spz_urls || {},
    createdAt: world.created_at || new Date().toISOString()
  };
}

function upsertWorld(world) {
  const normalized = normalizeWorld(world);
  worlds = [normalized, ...worlds.filter((item) => item.id !== normalized.id)];
  saveStoredWorlds();
  return normalized;
}

function setStatus(title, text, percent = 0) {
  statusTitle.textContent = title;
  statusText.textContent = text;
  progressBar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
}

function renderGallery() {
  const filtered = worlds.filter((world) => {
    if (activeFilter === "all") return true;
    if (activeFilter === "public") return world.public;
    if (activeFilter === "private") return !world.public;
    return world.model === activeFilter;
  });

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
    const article = document.createElement("article");
    article.className = "pin-card";
    article.innerHTML = `
      <button type="button" aria-label="Open ${escapeHtml(world.title)}">
        ${world.thumbnailUrl ? `<img class="world-thumb" src="${escapeAttribute(world.thumbnailUrl)}" alt="">` : `<div class="world-thumb missing-thumb">Marble</div>`}
        <div class="pin-copy">
          <h3>${escapeHtml(world.title)}</h3>
          <p>${escapeHtml(world.prompt || "World generated with Marble.")}</p>
          <div class="pin-meta"><span>${escapeHtml(world.model)}</span><span>${world.public ? "Public" : "Private"}</span></div>
        </div>
      </button>
    `;
    article.querySelector("button").addEventListener("click", () => openWorld(world));
    gallery.appendChild(article);
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}

async function generateWorld(event) {
  event.preventDefault();
  rememberApiKey();

  const prompt = promptInput.value.trim();
  if (!prompt) {
    setStatus("Prompt Required", "Describe the world you want Marble to create.", 0);
    promptInput.focus();
    return;
  }

  const displayName = displayNameInput.value.trim() || titleFromPrompt(prompt);
  const model = modelInput.value;
  const payload = {
    display_name: displayName,
    model,
    world_prompt: {
      type: "text",
      text_prompt: prompt
    },
    permission: {
      allow_id_access: true,
      allowed_readers: [],
      allowed_writers: [],
      public: publicWorldInput.checked
    },
    tags: ["marbleboard"]
  };

  setStatus("Starting", "Submitting world generation to World Labs Marble...", 3);

  try {
    const operation = await worldLabsFetch("/worlds:generate", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    setStatus("Generating", `Operation ${operation.operation_id} started. Marble worlds can take about 5 minutes.`, 8);
    await pollOperation(operation.operation_id);
  } catch (error) {
    setStatus("API Error", error.message, 0);
  }
}

async function pollOperation(operationId) {
  clearInterval(pollTimer);

  const poll = async () => {
    try {
      const operation = await worldLabsFetch(`/operations/${operationId}`, { method: "GET" });
      const progress = operation.metadata?.progress;
      const worldId = operation.metadata?.world_id;
      const description = progress?.description || (operation.done ? "World generation finished." : "World generation in progress.");
      const percent = operation.done ? 100 : Number(progress?.percentage || progress?.percent || progress?.progress || 18);

      setStatus(operation.done ? "Complete" : "Generating", worldId ? `${description} World ${worldId}.` : description, percent);

      if (!operation.done) return;

      clearInterval(pollTimer);
      if (operation.error) {
        throw new Error(operation.error.message || "World generation failed.");
      }

      const generated = operation.response?.world || operation.response;
      if (generated) {
        const world = upsertWorld(generated);
        renderGallery();
        openWorld(world);
      } else {
        await loadWorlds();
      }
    } catch (error) {
      clearInterval(pollTimer);
      setStatus("API Error", error.message, 0);
    }
  };

  await poll();
  pollTimer = setInterval(poll, 10000);
}

async function loadWorlds() {
  rememberApiKey();
  setStatus("Loading", "Fetching worlds created with your World Labs API key...", 25);

  try {
    const data = await worldLabsFetch("/worlds:list", {
      method: "POST",
      body: JSON.stringify({
        page_size: 50,
        sort_by: "created_at",
        tags: null
      })
    });
    worlds = (data.worlds || []).map(normalizeWorld);
    saveStoredWorlds();
    renderGallery();
    setStatus("Loaded", `${worlds.length} Marble world${worlds.length === 1 ? "" : "s"} loaded.`, 100);
  } catch (error) {
    setStatus("API Error", error.message, 0);
  }
}

function openWorld(world) {
  activeWorld = world;
  document.querySelector("#modalCategory").textContent = world.public ? "Public Marble World" : "Private Marble World";
  document.querySelector("#modalTitle").textContent = world.title;
  document.querySelector("#modalPrompt").textContent = world.prompt || "Generated with World Labs Marble.";
  document.querySelector("#modalProvider").textContent = world.model;
  document.querySelector("#modalStatus").textContent = world.status;
  document.querySelector("#worldId").textContent = world.id;
  document.querySelector("#openMarbleButton").href = world.marbleUrl || "#";
  document.querySelector("#modalAssets").textContent = summarizeAssets(world);
  previewImage.src = world.thumbnailUrl || world.panoUrl || "";
  previewImage.alt = world.title;
  previewImage.classList.toggle("is-empty", !previewImage.src);
  modal.showModal();
}

function summarizeAssets(world) {
  const assets = [];
  if (world.marbleUrl) assets.push("Marble URL");
  if (world.thumbnailUrl) assets.push("thumbnail");
  if (world.panoUrl) assets.push("pano");
  if (world.colliderMeshUrl) assets.push("GLB collider");
  if (Object.keys(world.spzUrls).length) assets.push("SPZ splats");
  return assets.join(", ") || "No assets returned yet";
}

document.querySelector("#newWorldTop").addEventListener("click", () => {
  promptInput.focus();
  window.scrollTo({ top: 0, behavior: "smooth" });
});

document.querySelectorAll(".filter-chip").forEach((button) => {
  button.addEventListener("click", () => {
    activeFilter = button.dataset.filter;
    document.querySelectorAll(".filter-chip").forEach((chip) => chip.classList.toggle("is-active", chip === button));
    renderGallery();
  });
});

document.querySelector("#menuButton").addEventListener("click", () => {
  drawer.classList.add("is-open");
  drawer.setAttribute("aria-hidden", "false");
});

document.querySelector("#closeDrawer").addEventListener("click", () => {
  drawer.classList.remove("is-open");
  drawer.setAttribute("aria-hidden", "true");
});

document.querySelector("#forgetKeyButton").addEventListener("click", forgetApiKey);

document.querySelector("#closeModal").addEventListener("click", () => modal.close());
document.querySelector("#copyButton").addEventListener("click", async () => {
  const url = activeWorld?.marbleUrl || `${location.href.split("#")[0]}#${activeWorld?.id || ""}`;
  await navigator.clipboard.writeText(url);
  setStatus("Copied", url, 100);
});

form.addEventListener("submit", generateWorld);
loadWorldsButton.addEventListener("click", loadWorlds);
apiKeyInput.addEventListener("change", rememberApiKey);

restoreApiKey();
promptInput.value = prompts[0];
renderGallery();
