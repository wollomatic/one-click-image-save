(function initDownloadUtils(globalScope) {
  const REFERER_MODES = new Set(["retry", "always"]);
  const INTERRUPT_REASONS = [
    "FILE_FAILED",
    "FILE_ACCESS_DENIED",
    "FILE_NO_SPACE",
    "FILE_NAME_TOO_LONG",
    "FILE_TOO_LARGE",
    "FILE_VIRUS_INFECTED",
    "FILE_TRANSIENT_ERROR",
    "FILE_BLOCKED",
    "FILE_SECURITY_CHECK_FAILED",
    "FILE_TOO_SHORT",
    "NETWORK_FAILED",
    "NETWORK_TIMEOUT",
    "NETWORK_DISCONNECTED",
    "NETWORK_SERVER_DOWN",
    "NETWORK_INVALID_REQUEST",
    "SERVER_FAILED",
    "SERVER_NO_RANGE",
    "SERVER_BAD_CONTENT",
    "SERVER_UNAUTHORIZED",
    "SERVER_CERT_PROBLEM",
    "SERVER_FORBIDDEN",
    "USER_CANCELED",
    "USER_SHUTDOWN",
    "CRASH"
  ];
  const RETRYABLE_REFERER_ERRORS = new Set([
    "SERVER_FORBIDDEN",
    "SERVER_UNAUTHORIZED"
  ]);

  function normalizeRefererMode(value) {
    return REFERER_MODES.has(value) ? value : "retry";
  }

  function shouldUseBrowserFilename(srcUrl, options) {
    return isHttpUrl(srcUrl) &&
      String(options.targetFolder || "").trim() === "" &&
      options.domainSubfolder !== true &&
      options.prefixDomain !== true &&
      options.prefixTimestamp !== true &&
      options.conflictAction !== "skip";
  }

  async function prepareDownloadUrl(srcUrl, fetchFn = globalScope.fetch, urlApi = globalScope.URL) {
    if (!isDataImageUrl(srcUrl)) {
      return {
        url: srcUrl,
        revoke() {}
      };
    }

    if (typeof fetchFn !== "function" || typeof urlApi?.createObjectURL !== "function") {
      throw new Error("Data image downloads are not supported in this context.");
    }

    const response = await fetchFn(srcUrl);

    if (!response.ok) {
      throw new Error("Could not read data image.");
    }

    const objectUrl = urlApi.createObjectURL(await response.blob());
    let revoked = false;

    return {
      url: objectUrl,
      revoke() {
        if (!revoked) {
          revoked = true;
          urlApi.revokeObjectURL(objectUrl);
        }
      }
    };
  }

  function isDataImageUrl(value) {
    return /^data:image\//i.test(String(value));
  }

  function isHttpUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch {
      return false;
    }
  }

  function interruptReason(error) {
    const message = String(error?.message || error || "");
    return INTERRUPT_REASONS.find((reason) => message.includes(reason)) || "UNKNOWN";
  }

  function isRetryableRefererError(reason) {
    return RETRYABLE_REFERER_ERRORS.has(reason);
  }

  async function runDownload(downloadsApi, options) {
    try {
      const id = await downloadsApi.download(options);
      return await waitForDownload(downloadsApi, id);
    } catch (error) {
      return {
        success: false,
        id: null,
        error: interruptReason(error)
      };
    }
  }

  function waitForDownload(downloadsApi, id) {
    return new Promise((resolve) => {
      let settled = false;
      let lastError = null;

      const finish = (result) => {
        if (settled) {
          return;
        }

        settled = true;
        downloadsApi.onChanged.removeListener(handleChanged);
        downloadsApi.onErased.removeListener(handleErased);
        resolve({ ...result, id });
      };

      const finishInterrupted = async () => {
        try {
          const [item] = await downloadsApi.search({ id });
          finish({
            success: false,
            error: item ? item.error || lastError || "UNKNOWN" : "UNKNOWN"
          });
        } catch {
          finish({
            success: false,
            error: lastError || "UNKNOWN"
          });
        }
      };

      const handleChanged = (delta) => {
        if (delta.id !== id || settled) {
          return;
        }

        if (delta.error?.current) {
          lastError = delta.error.current;
        }

        if (delta.state?.current === "complete") {
          finish({ success: true, error: null });
        } else if (delta.state?.current === "interrupted") {
          finishInterrupted();
        }
      };

      const handleErased = (erasedId) => {
        if (erasedId === id) {
          finish({ success: false, error: "UNKNOWN" });
        }
      };

      downloadsApi.onChanged.addListener(handleChanged);
      downloadsApi.onErased.addListener(handleErased);

      downloadsApi.search({ id }).then(([item]) => {
        if (settled) {
          return;
        }
        if (!item) {
          finish({ success: false, error: "UNKNOWN" });
        } else if (item.state === "complete") {
          finish({ success: true, error: null });
        } else if (item.state === "interrupted") {
          lastError = item.error || lastError;
          finishInterrupted();
        }
      }).catch(() => {
        finish({ success: false, error: "UNKNOWN" });
      });
    });
  }

  async function downloadWithRefererFallback(downloadsApi, primaryOptions, fallbackOptions) {
    const firstAttempt = await runDownload(downloadsApi, primaryOptions);

    if (
      firstAttempt.success ||
      !fallbackOptions ||
      !isRetryableRefererError(firstAttempt.error)
    ) {
      return firstAttempt;
    }

    const fallbackAttempt = await runDownload(downloadsApi, fallbackOptions);

    if (firstAttempt.id !== null && fallbackAttempt.id !== null) {
      await downloadsApi.erase({ id: firstAttempt.id }).catch(() => undefined);
    }

    return fallbackAttempt;
  }

  const downloadUtils = {
    downloadWithRefererFallback,
    interruptReason,
    isRetryableRefererError,
    normalizeRefererMode,
    prepareDownloadUrl,
    shouldUseBrowserFilename
  };

  if (typeof module === "object" && module.exports) {
    module.exports = downloadUtils;
    return;
  }

  globalScope.DownloadUtils = downloadUtils;
})(typeof globalThis === "object" ? globalThis : this);
