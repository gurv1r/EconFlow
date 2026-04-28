export function getCloudConfig() {
  const root = globalThis.UPLEARN_CLOUD_CONFIG || {};
  return {
    enabled: root.enabled !== false,
    firebase: root.firebase || {},
  };
}

export function hasFirebaseConfig(config) {
  return Boolean(config?.apiKey && config?.authDomain && config?.projectId && config?.appId);
}
