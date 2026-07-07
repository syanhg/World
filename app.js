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
const worldCanvas = document.querySelector("#worldCanvas");
const stageLoading = document.querySelector("#stageLoading");
const stageLoadingText = document.querySelector("#stageLoadingText");
const searchInput = document.querySelector("#searchInput");
const searchButton = document.querySelector("#searchButton");
const categorySelect = document.querySelector("#categorySelect");
const categoryGoButton = document.querySelector("#categoryGoButton");

let worlds = loadStoredWorlds();
let activeFilter = "all";
let activeSearch = "";
let activeWorld = worlds[0] || null;
let pollTimer = null;
let viewer = null;

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

function renderGallery() {
  const filtered = worlds.filter((world) => matchesFilter(world) && matchesSearch(world));

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

const PREVIEW_ORDER = ["100k", "500k", "full"];
const DETAIL_ORDER = ["500k", "full", "100k"];

function pickSpzUrl(spzUrls, preferenceOrder = DETAIL_ORDER) {
  if (!spzUrls) return "";
  for (const key of preferenceOrder) {
    if (spzUrls[key]) return spzUrls[key];
  }
  return Object.values(spzUrls)[0] || "";
}

async function loadSparkModules() {
  const [THREE, spark, addons] = await Promise.all([
    import("three"),
    import("@sparkjsdev/spark"),
    import("three/addons/controls/OrbitControls.js")
  ]);
  return { THREE, SparkRenderer: spark.SparkRenderer, SplatMesh: spark.SplatMesh, OrbitControls: addons.OrbitControls };
}

function frameSplat(THREE, splat) {
  const box = splat.getBoundingBox(true);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const radius = Math.max(size.x, size.y, size.z, 0.5) * 0.5;
  return { center, radius };
}

// ---------- Main immersive viewer (the full-screen modal) ----------

function resetStage() {
  stageLoading.hidden = true;
  stageLoading.classList.remove("is-error");
}

function disposeViewer() {
  if (!viewer) return;
  window.removeEventListener("resize", viewer.onResize);
  viewer.renderer.setAnimationLoop(null);
  viewer.controls.dispose();
  viewer.splat.dispose();
  viewer.renderer.dispose();
  viewer = null;
}

async function buildViewer(world) {
  const spzUrl = pickSpzUrl(world.spzUrls);
  if (!spzUrl) {
    throw new Error("This world does not have a Gaussian splat export available yet.");
  }

  const { THREE, SparkRenderer, SplatMesh, OrbitControls } = await loadSparkModules();

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(65, 1, 0.01, 2000);
  const renderer = new THREE.WebGLRenderer({ canvas: worldCanvas, antialias: true, alpha: true });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));

  const spark = new SparkRenderer({ renderer });
  scene.add(spark);

  const splat = new SplatMesh({
    url: spzUrl,
    onProgress: (event) => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 100);
        stageLoadingText.textContent = percent < 100 ? `Loading World Data… ${percent}%` : "Preparing 3D View…";
      }
    }
  });
  scene.add(splat);
  await splat.initialized;

  const { center, radius } = frameSplat(THREE, splat);
  camera.position.set(center.x, center.y, center.z + radius * 1.6);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(center);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = radius * 0.05;
  controls.maxDistance = radius * 5;
  controls.update();

  function onResize() {
    const rect = worldCanvas.parentElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    renderer.setSize(rect.width, rect.height, false);
    camera.aspect = rect.width / rect.height;
    camera.updateProjectionMatrix();
  }

  window.addEventListener("resize", onResize);
  onResize();

  renderer.setAnimationLoop(() => {
    controls.update();
    renderer.render(scene, camera);
  });

  return { worldId: world.id, renderer, scene, camera, controls, splat, onResize };
}

async function openWorld3d(world) {
  stageLoading.hidden = false;
  stageLoading.classList.remove("is-error");
  stageLoadingText.textContent = "Loading World Data…";

  try {
    disposeViewer();
    viewer = await buildViewer(world);
    if (!activeWorld || activeWorld.id !== world.id) {
      disposeViewer();
      return;
    }
    stageLoading.hidden = true;
  } catch (error) {
    stageLoadingText.textContent = error.message;
    stageLoading.classList.add("is-error");
  }
}

// ---------- Mini catalog previews (auto-rotating, no controls) ----------

const miniViewers = new Map();
const miniTokens = new WeakMap();
let miniObserver = null;

function ensureMiniObserver() {
  if (miniObserver) return miniObserver;
  miniObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const canvas = entry.target;
        if (entry.isIntersecting) {
          const world = worlds.find((item) => item.id === canvas.dataset.worldId);
          if (world) startMiniViewer(canvas, world);
        } else {
          stopMiniViewer(canvas);
        }
      });
    },
    { rootMargin: "150px" }
  );
  return miniObserver;
}

function startMiniViewer(canvas, world) {
  if (miniViewers.has(canvas)) return;
  const spzUrl = pickSpzUrl(world.spzUrls, PREVIEW_ORDER);
  if (!spzUrl) return;

  const token = { cancelled: false };
  miniTokens.set(canvas, token);

  buildMiniViewer(canvas, spzUrl).then((built) => {
    if (token.cancelled) {
      built.dispose();
      return;
    }
    miniViewers.set(canvas, built);
  }).catch(() => {});
}

function stopMiniViewer(canvas) {
  const token = miniTokens.get(canvas);
  if (token) token.cancelled = true;
  const built = miniViewers.get(canvas);
  if (built) {
    built.dispose();
    miniViewers.delete(canvas);
  }
}

async function buildMiniViewer(canvas, spzUrl) {
  const { THREE, SparkRenderer, SplatMesh } = await loadSparkModules();

  const width = canvas.clientWidth || 108;
  const height = canvas.clientHeight || 108;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, width / height, 0.01, 2000);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(width, height, false);

  const spark = new SparkRenderer({ renderer });
  scene.add(spark);

  const splat = new SplatMesh({ url: spzUrl });
  scene.add(splat);
  await splat.initialized;

  const { center, radius } = frameSplat(THREE, splat);
  let angle = Math.random() * Math.PI * 2;

  function animate() {
    angle += 0.004;
    camera.position.set(
      center.x + Math.sin(angle) * radius * 1.5,
      center.y + radius * 0.2,
      center.z + Math.cos(angle) * radius * 1.5
    );
    camera.lookAt(center);
    renderer.render(scene, camera);
  }

  renderer.setAnimationLoop(animate);

  return {
    renderer,
    animate,
    dispose() {
      renderer.setAnimationLoop(null);
      splat.dispose();
      renderer.dispose();
    }
  };
}

function pauseMiniViewers() {
  miniViewers.forEach((v) => v.renderer.setAnimationLoop(null));
}

function resumeMiniViewers() {
  miniViewers.forEach((v) => v.renderer.setAnimationLoop(v.animate));
}

function openWorld(world) {
  if (viewer && viewer.worldId !== world.id) {
    disposeViewer();
  }
  resetStage();
  pauseMiniViewers();

  activeWorld = world;
  document.querySelector("#modalCategory").textContent = world.public ? "Public Marble World" : "Private Marble World";
  document.querySelector("#modalTitle").textContent = world.title;
  document.querySelector("#modalProvider").textContent = world.model;
  document.querySelector("#modalStatus").textContent = world.status;
  document.querySelector("#worldId").textContent = world.id;
  document.querySelector("#openMarbleButton").href = world.marbleUrl || "#";
  document.querySelector("#modalAssets").textContent = summarizeAssets(world);
  modal.showModal();

  if (viewer && viewer.worldId === world.id) {
    stageLoading.hidden = true;
  } else {
    openWorld3d(world);
  }
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

document.querySelector("#forgetKeyButton").addEventListener("click", forgetApiKey);
document.querySelector("#closeModal").addEventListener("click", () => modal.close());
modal.addEventListener("close", () => {
  disposeViewer();
  resetStage();
  resumeMiniViewers();
});

document.querySelector("#copyButton").addEventListener("click", async () => {
  const url = activeWorld?.marbleUrl || `${location.href.split("#")[0]}#${activeWorld?.id || ""}`;
  await navigator.clipboard.writeText(url);
  setStatus("Copied", url, 100);
});

form.addEventListener("submit", generateWorld);
loadWorldsButton.addEventListener("click", loadWorlds);
apiKeyInput.addEventListener("change", rememberApiKey);

const today = new Date();
const mastheadDate = document.querySelector("#masthead-date");
const footerYear = document.querySelector("#footer-year");
if (mastheadDate) mastheadDate.textContent = today.toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase();
if (footerYear) footerYear.textContent = String(today.getFullYear());

restoreApiKey();
promptInput.value = prompts[0];
renderGallery();
