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

  function createDownloadManager(downloadsApi, sessionStorage, {
    onComplete = () => {},
    onError = () => {},
    revokeObjectURL = (url) => globalScope.URL.revokeObjectURL(url)
  } = {}) {
    const keyPrefix = "pendingDownload:";
    const records = new Map();
    let work = Promise.resolve();

    function enqueue(action) {
      const task = work.then(action);
      // A failed API call must not prevent later download events from running.
      work = task.catch(() => undefined);
      return task;
    }

    async function forget(id) {
      await sessionStorage.remove(keyPrefix + id);
      records.delete(id);
    }

    async function finish(id, success) {
      const record = records.get(id);
      if (!record) {
        return;
      }
      await forget(id);
      if (record.objectUrl) {
        revokeObjectURL(record.objectUrl);
      }
      if (success) {
        await onComplete(record);
      } else {
        onError();
      }
    }

    async function launch(options, record, previousId = null) {
      let id;
      try {
        id = await downloadsApi.download(options);
      } catch (error) {
        if (record.fallbackOptions && isRetryableRefererError(interruptReason(error))) {
          return launch(record.fallbackOptions, { ...record, fallbackOptions: null }, previousId);
        }
        throw error;
      }

      try {
        await sessionStorage.set({ [keyPrefix + id]: record });
      } catch (error) {
        await downloadsApi.cancel(id).catch(() => undefined);
        throw error;
      }
      records.set(id, record);
      if (previousId !== null) {
        await forget(previousId);
        await downloadsApi.erase({ id: previousId }).catch(() => undefined);
      }
      // Downloads can finish before download() resolves or before state is saved.
      await reconcile(id).catch(onError);
      return id;
    }

    async function reconcile(id) {
      const record = records.get(id);
      if (!record) {
        return;
      }
      const [item] = await downloadsApi.search({ id });
      if (!item) {
        await finish(id, false);
      } else if (item.state === "complete") {
        await finish(id, true);
      } else if (item.state === "interrupted" && !item.paused) {
        if (record.fallbackOptions && isRetryableRefererError(item.error)) {
          try {
            await launch(record.fallbackOptions, { ...record, fallbackOptions: null }, id);
          } catch {
            await finish(id, false);
          }
        } else {
          await finish(id, false);
        }
      }
    }

    // Install listeners before any storage read, so Firefox can wake this page.
    downloadsApi.onChanged.addListener((delta) => enqueue(() => {
      if (delta.state?.current === "complete") {
        return finish(delta.id, true);
      }
      return reconcile(delta.id);
    }).catch(onError));
    downloadsApi.onErased.addListener((id) => enqueue(() => finish(id, false)).catch(onError));

    const ready = enqueue(async () => {
      const saved = await sessionStorage.get(null);
      for (const [key, record] of Object.entries(saved)) {
        if (key.startsWith(keyPrefix)) {
          records.set(Number(key.slice(keyPrefix.length)), record);
        }
      }
      for (const id of [...records.keys()]) {
        await reconcile(id).catch(onError);
      }
    });
    ready.catch(onError);

    return {
      ready,
      start(primaryOptions, fallbackOptions, { tabId = null, objectUrl = null } = {}) {
        return enqueue(() => launch(primaryOptions, { tabId, objectUrl, fallbackOptions }));
      }
    };
  }

  const downloadUtils = {
    createDownloadManager,
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
