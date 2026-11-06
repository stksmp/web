document.addEventListener("click", async event => {
  const button = event.target.closest("[data-copy]");
  if (button) {
    try {
      await navigator.clipboard.writeText(button.dataset.copy);
      const old = button.textContent; button.textContent = "Copied!";
      setTimeout(() => button.textContent = old, 1400);
    } catch { button.textContent = "Copy unavailable"; }
  }
});
document.querySelectorAll("form[data-api]").forEach(form => {
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const output = form.querySelector(".form-message");
    const button = form.querySelector('[type="submit"]');
    output.textContent = "Submitting…"; button.disabled = true;
    try {
      const response = await fetch(form.dataset.api, { method:"POST", body:new FormData(form) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Submission failed.");
      output.textContent = data.message || "Submitted successfully.";
      form.reset();
    } catch (error) { output.textContent = error.message; }
    finally { button.disabled = false; }
  });
});
async function loadRank() {
  const target = document.querySelector("#rank-status");
  if (!target) return;
  try {
    const response = await fetch("/api/craftrank");
    const data = await response.json();
    if (!response.ok || !data.verified) throw new Error(data.message || "Not verified");
    target.textContent = "Live data received. See the CraftRank listing for the verified placement.";
  } catch { target.textContent = "Live ranking could not be verified. Check CraftRank for the current placement."; }
}
loadRank();
