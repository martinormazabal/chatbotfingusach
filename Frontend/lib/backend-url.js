const CLOUD_WORKSTATION_HOST_REGEX = /^(\d+)-(.*)$/;

export function sanitizeBaseUrl(url = "") {
  if (typeof url !== "string") return "";
  return url.trim().replace(/\/$/, "");
}

function firstHeaderValue(value) {
  if (!value) return "";
  if (Array.isArray(value)) {
    return value.find((item) => typeof item === "string" && item.trim()) || "";
  }
  return typeof value === "string" ? value : "";
}

export function resolveBackendBaseUrl(req) {
  const envUrl =
    sanitizeBaseUrl(process.env.NEXT_PUBLIC_BACKEND_URL) ||
    sanitizeBaseUrl(process.env.BACKEND_URL);

  if (envUrl) {
    return envUrl;
  }

  const defaultPort = String(process.env.BACKEND_PORT || 5000);
  const defaultProto = firstHeaderValue(process.env.BACKEND_PROTOCOL) || "http";

  if (req && req.headers) {
    const forwardedHost =
      firstHeaderValue(req.headers["x-forwarded-host"]) ||
      firstHeaderValue(req.headers.host);
    const forwardedProto =
      firstHeaderValue(req.headers["x-forwarded-proto"]) || defaultProto;

    if (forwardedHost) {
      const cloudMatch = forwardedHost.match(CLOUD_WORKSTATION_HOST_REGEX);
      if (cloudMatch && cloudMatch[2]) {
        return `${forwardedProto}://${defaultPort}-${cloudMatch[2]}`;
      }

      if (forwardedHost.includes("localhost")) {
        return `http://localhost:${defaultPort}`;
      }

      if (/^\d+\.\d+\.\d+\.\d+$/.test(forwardedHost)) {
        return `${forwardedProto}://${forwardedHost.split(":")[0]}:${defaultPort}`;
      }
    }
  }

  return `${defaultProto}://127.0.0.1:${defaultPort}`;
}