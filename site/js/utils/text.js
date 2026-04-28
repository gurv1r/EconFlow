export function normalizeLooseString(value) {
  return String(value).trim().toLowerCase().replace(/\s+/g, " ");
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function repairMojibake(value) {
  const text = String(value ?? "");
  if (!/[ÃƒÃ‚Ã¢]/.test(text)) return text;
  try {
    const bytes = Uint8Array.from(text, (char) => char.charCodeAt(0) & 0xff);
    const decoded = new TextDecoder("utf-8").decode(bytes);
    if (decoded && !decoded.includes("\uFFFD")) return decoded;
  } catch (_) {
    // Fall through to targeted replacements.
  }
  return text
    .replaceAll("Ã‚Â£", "Â£")
    .replaceAll("Ã¢â‚¬â„¢", "â€™")
    .replaceAll("Ã¢â‚¬Ëœ", "â€˜")
    .replaceAll("Ã¢â‚¬Å“", "â€œ")
    .replaceAll("Ã¢â‚¬\u009d", "â€")
    .replaceAll("Ã¢â‚¬â€œ", "â€“")
    .replaceAll("Ã¢â‚¬â€", "â€”")
    .replaceAll("Ã¢â‚¬Â¦", "â€¦")
    .replaceAll("Ã‚", "");
}

export function normalizeMathishContent(value) {
  let normalized = repairMojibake(value ?? "");
  normalized = normalized
    .replace(/\\newline/gi, " ")
    .replace(/\\text(?:normal|rm|bf|it|mathrm)\{([^{}]*)\}/gi, "$1")
    .replace(/\\frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/gi, "($1/$2)")
    .replace(/\\pm/gi, "Â±")
    .replace(/\\times/gi, "Ã—")
    .replace(/\\cdot/gi, "Â·")
    .replace(/\\leq/gi, "â‰¤")
    .replace(/\\geq/gi, "â‰¥")
    .replace(/\\neq/gi, "â‰ ")
    .replace(/\\approx/gi, "â‰ˆ")
    .replace(/\\rightarrow/gi, "â†’")
    .replace(/\\left|\\right/gi, "")
    .replace(/\\%/g, "%")
    .replace(/\\_/g, "_")
    .replace(/\\\s+/g, " ")
    .replace(/[{}]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return normalized === "$$" ? "" : normalized;
}

export function sanitizeRichText(value) {
  const repaired = repairMojibake(value ?? "");
  return repaired
    .replace(/\$\$\\newline\$\$/gi, "<br /><br />")
    .replace(/\$\$([\s\S]*?)\$\$/g, (_, inner) => {
      const normalized = normalizeMathishContent(inner);
      return normalized ? escapeHtml(normalized) : "";
    })
    .replace(/\\n/g, "<br />")
    .replace(/>\s+</g, "> <");
}

export function stripHtml(value) {
  return String(value).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function normalizeQuizHtmlFragment(value) {
  const cleaned = sanitizeRichText(value || "")
    .replace(/(?:<br\s*\/?>\s*){3,}/gi, "<br /><br />")
    .trim();
  const textOnly = stripHtml(cleaned).trim();
  return textOnly ? cleaned : "";
}

export function formatQuizText(value, fallback = "") {
  const normalized = stripHtml(sanitizeRichText(value || ""));
  return normalized || fallback;
}
