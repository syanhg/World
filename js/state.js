import { STORAGE_KEY, API_KEY_STORAGE_KEY } from "./constants.js";
import { apiKeyInput } from "./dom.js";

function loadStoredWorlds() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

// Shared, cross-module app state. Everything else (active filter, active
// world, poll timers) is only ever read within the module that owns it, so
// it stays local to that module instead of living here.
export const state = {
  worlds: loadStoredWorlds(),
  mainViewerOpen: false
};

export function saveStoredWorlds() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.worlds));
}

export function getApiKey() {
  return apiKeyInput.value.trim();
}

export function rememberApiKey() {
  const key = getApiKey();
  if (key) {
    localStorage.setItem(API_KEY_STORAGE_KEY, key);
  }
  return key;
}

export function restoreApiKey() {
  apiKeyInput.value = localStorage.getItem(API_KEY_STORAGE_KEY) || "";
}

export function clearApiKey() {
  localStorage.removeItem(API_KEY_STORAGE_KEY);
  apiKeyInput.value = "";
}
