// Entry point: wires up the remaining top-level event listeners and boots
// the app. Everything else lives in its own module and attaches its own
// listeners on import.
import { prompts } from "./constants.js";
import { restoreApiKey, rememberApiKey, clearApiKey } from "./state.js";
import { setStatus } from "./status.js";
import { generateWorld, loadWorlds } from "./api.js";
import { renderGallery } from "./gallery.js";
import "./viewer.js";
import {
  form,
  apiKeyInput,
  promptInput,
  loadWorldsButton,
  forgetKeyButton,
  mastheadDate,
  footerYear
} from "./dom.js";

form.addEventListener("submit", generateWorld);
loadWorldsButton.addEventListener("click", loadWorlds);
apiKeyInput.addEventListener("change", rememberApiKey);

forgetKeyButton.addEventListener("click", () => {
  clearApiKey();
  setStatus("Key Forgotten", "Your saved World Labs API key was removed from this browser.", 0);
});

const today = new Date();
if (mastheadDate) mastheadDate.textContent = today.toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase();
if (footerYear) footerYear.textContent = String(today.getFullYear());

restoreApiKey();
promptInput.value = prompts[0];
renderGallery();
