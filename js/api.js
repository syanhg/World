// World Labs Marble API calls: generating worlds, polling operations, and
// listing the worlds behind a given API key.
import { WORLD_LABS_API } from "./constants.js";
import { state, saveStoredWorlds, getApiKey, rememberApiKey } from "./state.js";
import { titleFromPrompt, normalizeWorld } from "./format.js";
import { setStatus } from "./status.js";
import { promptInput, modelInput, displayNameInput, publicWorldInput } from "./dom.js";
import { renderGallery } from "./gallery.js";
import { openWorld } from "./viewer.js";

let pollTimer = null;

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

function upsertWorld(world) {
  const normalized = normalizeWorld(world);
  state.worlds = [normalized, ...state.worlds.filter((item) => item.id !== normalized.id)];
  saveStoredWorlds();
  return normalized;
}

export async function generateWorld(event) {
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

export async function loadWorlds() {
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
    state.worlds = (data.worlds || []).map(normalizeWorld);
    saveStoredWorlds();
    renderGallery();
    setStatus("Loaded", `${state.worlds.length} Marble world${state.worlds.length === 1 ? "" : "s"} loaded.`, 100);
  } catch (error) {
    setStatus("API Error", error.message, 0);
  }
}
