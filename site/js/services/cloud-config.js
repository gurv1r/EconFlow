export function getCloudConfig() {
  const root = globalThis.UPLEARN_CLOUD_CONFIG || {};
  return {
    enabled: root.enabled !== false,
    adminEmails: Array.isArray(root.adminEmails) ? root.adminEmails : [],
    accessControl: {
      enabled: root.accessControl?.enabled !== false,
      allowSelfSignup: root.accessControl?.allowSelfSignup !== false,
      requireApproval: root.accessControl?.requireApproval !== false,
      allowDevBypassOnLocalhost: root.accessControl?.allowDevBypassOnLocalhost !== false,
    },
    firebase: root.firebase || {},
  };
}

export function hasFirebaseConfig(config) {
  return Boolean(config?.apiKey && config?.authDomain && config?.projectId && config?.appId);
}
