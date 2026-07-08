import { progressBar, statusTitle, statusText } from "./dom.js";

export function setStatus(title, text, percent = 0) {
  statusTitle.textContent = title;
  statusText.textContent = text;
  progressBar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
}
