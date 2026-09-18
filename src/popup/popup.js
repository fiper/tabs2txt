import { getSettings, patchSettings } from "../common/settings.js";

const toggle = document.querySelector("#enabled");
const state = document.querySelector("#state");

function describe({ enabled, intervalMinutes }) {
  if (!enabled) return "Paused";
  return intervalMinutes === 1 ? "Every minute" : `Every ${intervalMinutes} minutes`;
}

async function render() {
  const settings = await getSettings();
  toggle.checked = settings.enabled;
  toggle.disabled = false;
  state.textContent = describe(settings);
}

toggle.addEventListener("change", async () => {
  toggle.disabled = true;
  await patchSettings({ enabled: toggle.checked });
  await render();
});

render();
