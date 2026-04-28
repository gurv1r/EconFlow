import { archiveUrl } from "../config/env.js";

function extractBodyHtml(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  return doc.body?.innerHTML || html;
}

export function createArchiveResourceLoader(cache) {
  async function fetchStudyHtml(path) {
    const key = `html:${path}`;
    if (cache.has(key)) return cache.get(key);
    const response = await fetch(archiveUrl(path));
    if (!response.ok) throw new Error(`Failed to load HTML resource: ${path}`);
    const text = await response.text();
    const body = extractBodyHtml(text);
    cache.set(key, body);
    return body;
  }

  async function fetchJson(path) {
    const key = `json:${path}`;
    if (cache.has(key)) return cache.get(key);
    const response = await fetch(archiveUrl(path));
    if (!response.ok) throw new Error(`Failed to load JSON resource: ${path}`);
    const data = await response.json();
    cache.set(key, data);
    return data;
  }

  return {
    fetchJson,
    fetchStudyHtml,
  };
}
