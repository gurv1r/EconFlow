(() => {
  function normalise(value) {
    return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
  }

  function getPlayNextLabel(text) {
    const match = String(text || "").trim().match(/^play\s*next\s*:\s*(.+)$/i);
    return match ? match[1].trim() : "";
  }

  function findExistingVideoAction(label, sourceControl) {
    const target = normalise(label);
    if (!target) return null;

    const controls = [...document.querySelectorAll("button, a")];
    return controls.find((control) => {
      if (control === sourceControl) return false;
      const text = normalise(control.textContent);
      if (!text || text.startsWith("play next:")) return false;
      return text === target || text.includes(target);
    }) || null;
  }

  document.addEventListener("click", (event) => {
    const control = event.target.closest?.("button, a");
    if (!control) return;

    const nextLabel = getPlayNextLabel(control.textContent);
    if (!nextLabel) return;

    const action = findExistingVideoAction(nextLabel, control);
    if (!action) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    action.click();
  }, true);
})();
