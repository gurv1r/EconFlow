(function () {
  const STORAGE_KEY = "econflow-theme";
  const THEMES = new Set(["light", "dark"]);
  const root = document.documentElement;
  const systemQuery = window.matchMedia("(prefers-color-scheme: dark)");

  function getSavedTheme() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return THEMES.has(saved) ? saved : null;
    } catch {
      return null;
    }
  }

  function saveTheme(theme) {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Theme switching should still work for the current page if storage is unavailable.
    }
  }

  function getSystemTheme() {
    return systemQuery.matches ? "dark" : "light";
  }

  function getActiveTheme() {
    return getSavedTheme() || getSystemTheme();
  }

  function syncToggle(toggle, theme) {
    const isDark = theme === "dark";
    toggle.setAttribute("aria-pressed", String(isDark));
    toggle.setAttribute("aria-label", `Switch to ${isDark ? "light" : "dark"} mode`);
    const label = toggle.querySelector("[data-theme-label]");
    if (label) label.textContent = isDark ? "DARK" : "LIGHT";
  }

  function applyTheme(theme) {
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    document.querySelectorAll(".theme-toggle").forEach((toggle) => syncToggle(toggle, theme));
  }

  function bindToggles() {
    document.querySelectorAll(".theme-toggle").forEach((toggle) => {
      syncToggle(toggle, getActiveTheme());
      toggle.addEventListener("click", () => {
        const nextTheme = root.dataset.theme === "dark" ? "light" : "dark";
        saveTheme(nextTheme);
        applyTheme(nextTheme);
      });
    });
  }

  applyTheme(getActiveTheme());

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindToggles, { once: true });
  } else {
    bindToggles();
  }

  systemQuery.addEventListener("change", () => {
    if (!getSavedTheme()) applyTheme(getSystemTheme());
  });
})();
