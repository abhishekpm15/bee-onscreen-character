const toggle = document.getElementById("toggle");
const status = document.getElementById("status");

function render(enabled) {
  toggle.checked = enabled;
  status.textContent = enabled ? "Buzzy is flying around!" : "Buzzy is resting";
}

chrome.storage.local.get({ beeEnabled: false }, ({ beeEnabled }) => render(beeEnabled));

toggle.addEventListener("change", () => {
  chrome.storage.local.set({ beeEnabled: toggle.checked });
  render(toggle.checked);
});
