globalThis.UPLEARN_CLOUD_CONFIG = {
  enabled: true,
  adminEmails: [],
  accessControl: {
    enabled: true,
    allowSelfSignup: true,
    requireApproval: true,
    allowDevBypassOnLocalhost: true,
  },
  firebase: {
    apiKey: "AIzaSyB_ovJny8bFormILSllh_VoS5LJhawWK7E",
    authDomain: "uplearn-econ-dash-260426.firebaseapp.com",
    projectId: "uplearn-econ-dash-260426",
    appId: "1:456002760868:web:45a07716b0088032e2b631",
    messagingSenderId: "456002760868",
    storageBucket: "uplearn-econ-dash-260426.firebasestorage.app",
    measurementId: "G-4L5GTEJ417",
  },
};

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

    return [...document.querySelectorAll("button, a")].find((control) => {
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
