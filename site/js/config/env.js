const LOCAL_ARCHIVE_ROOT = new URL("../", window.location.href).toString();
const HOSTED_ARCHIVE_ROOT = "https://storage.googleapis.com/uplearn-economics-study-dashboard-assets-260426/";
const LOCAL_ARCHIVE_HOSTNAMES = new Set(["127.0.0.1", "localhost"]);

export function getArchiveRoot() {
  return LOCAL_ARCHIVE_HOSTNAMES.has(window.location.hostname) ? LOCAL_ARCHIVE_ROOT : HOSTED_ARCHIVE_ROOT;
}

export function archiveUrl(path) {
  if (!path) return null;
  const normalized = String(path).replaceAll("\\", "/").replace(/^\/+/, "");
  const encoded = normalized
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return new URL(encoded, getArchiveRoot()).toString();
}

export function getCatalogUrl() {
  return "./catalog.json";
}
