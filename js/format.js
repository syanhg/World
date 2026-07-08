import { DETAIL_ORDER } from "./constants.js";

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

export function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}

export function titleFromPrompt(prompt) {
  const words = prompt.replace(/[^a-z0-9 ]/gi, "").split(" ").filter(Boolean);
  const picked = words.filter((word) => word.length > 3).slice(0, 2);
  return picked.length ? picked.map((word) => word[0].toUpperCase() + word.slice(1)).join(" ") : "Untitled World";
}

export function normalizeWorld(world) {
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

export function pickSpzUrl(spzUrls, preferenceOrder = DETAIL_ORDER) {
  if (!spzUrls) return "";
  for (const key of preferenceOrder) {
    if (spzUrls[key]) return spzUrls[key];
  }
  return Object.values(spzUrls)[0] || "";
}
