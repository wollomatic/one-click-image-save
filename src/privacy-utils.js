(function initPrivacyUtils(globalScope) {
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

  const privacyUtils = {
    buildRefererHeaders
  };

  if (typeof module === "object" && module.exports) {
    module.exports = privacyUtils;
    return;
  }

  globalScope.PrivacyUtils = privacyUtils;
})(typeof globalThis === "object" ? globalThis : this);
