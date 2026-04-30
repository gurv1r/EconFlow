const SITE_NAME = "EconFlow";
const SITE_DESCRIPTION = "Edexcel A-Level Economics revision dashboard featuring notes, questions, and diagrams.";

const SEO_DEFAULTS = {
  siteName: SITE_NAME,
  siteDescription: SITE_DESCRIPTION,
  defaultTitle: `${SITE_NAME} | A-Level Economics Revision, Notes & Questions`,
  defaultDescription: "Revise A-Level Economics with EconFlow. Study Edexcel topics, economics notes, diagrams, definitions, questions, and exam-focused revision resources in one organised dashboard.",
  defaultKeywords: "A Level Economics revision, A-Level Economics notes, A-Level Economics questions, A-Level Economics diagrams, Edexcel Economics revision, macroeconomics revision, microeconomics revision",
  structuredDataType: "WebSite",
};

function ensureMeta(selector, attributes = {}) {
  let node = document.head.querySelector(selector);
  if (!node) {
    node = document.createElement("meta");
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
    document.head.append(node);
  }
  return node;
}

function ensureLink(selector, attributes = {}) {
  let node = document.head.querySelector(selector);
  if (!node) {
    node = document.createElement("link");
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
    document.head.append(node);
  }
  return node;
}

function ensureStructuredDataNode() {
  let node = document.getElementById("structuredDataJson");
  if (!node) {
    node = document.createElement("script");
    node.type = "application/ld+json";
    node.id = "structuredDataJson";
    document.head.append(node);
  }
  return node;
}

function getCanonicalUrl() {
  const url = new URL(window.location.href);
  url.hash = "";
  return url.toString();
}

export function applySeoContext({ pageTitle = "", sectionTitle = "" } = {}) {
  const titleParts = [pageTitle, sectionTitle, SEO_DEFAULTS.siteName].filter(Boolean);
  const title = titleParts.length ? titleParts.join(" | ") : SEO_DEFAULTS.defaultTitle;
  const description = SEO_DEFAULTS.defaultDescription;
  const canonicalUrl = getCanonicalUrl();

  document.title = title;

  ensureMeta('meta[name="description"]', { name: "description" }).setAttribute("content", description);
  ensureMeta('meta[name="keywords"]', { name: "keywords" }).setAttribute("content", SEO_DEFAULTS.defaultKeywords);
  ensureMeta('meta[property="og:title"]', { property: "og:title" }).setAttribute("content", title);
  ensureMeta('meta[property="og:description"]', { property: "og:description" }).setAttribute("content", description);
  ensureMeta('meta[property="og:type"]', { property: "og:type" }).setAttribute("content", "website");
  ensureMeta('meta[property="og:url"]', { property: "og:url" }).setAttribute("content", canonicalUrl);
  ensureMeta('meta[property="og:site_name"]', { property: "og:site_name" }).setAttribute("content", SEO_DEFAULTS.siteName);
  ensureMeta('meta[name="twitter:card"]', { name: "twitter:card" }).setAttribute("content", "summary");
  ensureMeta('meta[name="twitter:title"]', { name: "twitter:title" }).setAttribute("content", title);
  ensureMeta('meta[name="twitter:description"]', { name: "twitter:description" }).setAttribute("content", description);
  ensureMeta('meta[name="application-name"]', { name: "application-name" }).setAttribute("content", SEO_DEFAULTS.siteName);
  ensureMeta('meta[name="apple-mobile-web-app-title"]', { name: "apple-mobile-web-app-title" }).setAttribute("content", SEO_DEFAULTS.siteName);

  ensureLink('link[rel="canonical"]', { rel: "canonical" }).setAttribute("href", canonicalUrl);

  const structuredData = {
    "@context": "https://schema.org",
    "@type": SEO_DEFAULTS.structuredDataType,
    name: SEO_DEFAULTS.siteName,
    url: canonicalUrl,
    description,
  };

  ensureStructuredDataNode().textContent = JSON.stringify(structuredData, null, 2);
}

export function getSiteDescription() {
  return SITE_DESCRIPTION;
}
