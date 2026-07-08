export const WORLD_LABS_API = "https://api.worldlabs.ai/marble/v1";
export const STORAGE_KEY = "marbleboard-api-worlds";
export const API_KEY_STORAGE_KEY = "marbleboard-api-key";

export const prompts = [
  "A marble quarry city at dusk, red lanterns, navigable stairways, hidden observatory",
  "A flooded library world with rowing paths between shelves and glowing catalog towers",
  "A cliffside tea market built into giant basalt columns, mist, cable bridges",
  "A quiet desert observatory where mirrors bloom from the sand after sunset"
];

// Prefer the smallest splat tier everywhere. Gaussian splat rendering cost
// scales with point count, and "500k"/"full" tiers are heavy enough to make
// the full-screen viewer stutter on most laptops — "100k" stays smooth while
// still reading as the same world.
export const PREVIEW_ORDER = ["100k", "500k", "full"];
export const DETAIL_ORDER = ["100k", "500k", "full"];

// Cap how many catalog previews can be downloading at once. Splat files are
// multi-megabyte, and letting a whole screen of tiles fetch simultaneously
// starves bandwidth from whatever the user actually opens next (including
// the full-screen viewer) — this was the main suspect behind loads that
// never seemed to finish.
export const MAX_CONCURRENT_MINI_LOADS = 2;
