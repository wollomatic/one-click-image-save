(function initPrivacyUtils(globalScope) {
  const MAX_LOG_PATH_LENGTH = 80;

  function buildRefererHeaders(srcUrl, info, enabled) {
    if (enabled !== true) {
      return undefined;
    }

    const referer = downloadReferer(srcUrl, info);

    return referer ? [{ name: "Referer", value: referer }] : undefined;
  }

  function downloadReferer(srcUrl, info) {
    const imageUrl = parseHttpUrl(srcUrl);
    const documentUrl = parseHttpUrl(info.frameUrl) || parseHttpUrl(info.pageUrl);

    if (!imageUrl || !documentUrl) {
      return null;
    }

    if (documentUrl.protocol === "https:" && imageUrl.protocol === "http:") {
      return null;
    }

    if (documentUrl.origin === imageUrl.origin) {
      return sameOriginReferer(documentUrl);
    }

    return `${documentUrl.origin}/`;
  }

  function sameOriginReferer(url) {
    const referer = new URL(url.href);
    referer.username = "";
    referer.password = "";
    referer.search = "";
    referer.hash = "";

    return referer.href;
  }

  function parseHttpUrl(value) {
    try {
      const url = new URL(value);

      if (url.protocol === "http:" || url.protocol === "https:") {
        return url;
      }
    } catch {
      // Ignore invalid URLs.
    }

    return null;
  }

  function safeUrlForLog(value) {
    if (typeof value !== "string") {
      return unparseableUrlDescription(value);
    }

    try {
      const url = new URL(value);

      if (url.protocol !== "http:" && url.protocol !== "https:") {
        return `${sanitizeLogPart(url.protocol)}[redacted]`;
      }

      const path = sanitizeLogPart(url.pathname).slice(0, MAX_LOG_PATH_LENGTH);
      const truncated = url.pathname.length > MAX_LOG_PATH_LENGTH ? "..." : "";

      // Credentials, query parameters, and fragments are deliberately omitted.
      return `${url.protocol}//${url.host}${path}${truncated}`;
    } catch {
      return unparseableUrlDescription(value);
    }
  }

  function sanitizeLogPart(value) {
    return String(value).replace(/[\u0000-\u001f\u007f]/g, "");
  }

  function unparseableUrlDescription(value) {
    const type = value === null ? "null" : typeof value;
    const length = typeof value === "string" ? value.length : 0;

    return `[unparseable URL: type=${type}, length=${length}]`;
  }

  const privacyUtils = {
    buildRefererHeaders,
    safeUrlForLog
  };

  if (typeof module === "object" && module.exports) {
    module.exports = privacyUtils;
    return;
  }

  globalScope.PrivacyUtils = privacyUtils;
})(typeof globalThis === "object" ? globalThis : this);
