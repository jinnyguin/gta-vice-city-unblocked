import {
  LANGUAGES,
  applyTranslations,
  changeLanguage,
  currentLanguage,
  setRawText,
  setText,
  t,
} from "./i18n/index.js";

const ASSET_RELEASE_URL = import.meta.env.VITE_ASSET_URL;

// Set when the page is about to reload itself, so the splash stays up.
let pageReloading = false;

// Set when the user taps the splash gear to reach saves/skins. The page
// reloads once into the setup screen instead of autostarting the game.
const SETUP_FLAG = "vc-open-setup";
let leavingForSetup = false;

function takeSetupFlag() {
  try {
    const requested = sessionStorage.getItem(SETUP_FLAG) === "1";
    sessionStorage.removeItem(SETUP_FLAG);
    return requested;
  } catch {
    return false;
  }
}

const BASE = import.meta.env.BASE_URL;

const LEGACY_SCRIPT_SOURCES = [
  `${BASE}GamepadEmulator.js`,
  `${BASE}idbfs.js`,
  `${BASE}shared.js`,
  `${BASE}saves.js`,
  `${BASE}skins.js`,
  `${BASE}game.js`,
];

function isLocalDevEnvironment() {
  return (
    window.location.protocol === "file:" ||
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
  );
}

async function clearDevelopmentServiceWorkers() {
  if (!("serviceWorker" in navigator) || !isLocalDevEnvironment()) {
    return;
  }

  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((registration) => registration.unregister()));
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existingScript = document.querySelector(`script[src="${src}"]`);
    if (existingScript) {
      if (existingScript.dataset.loaded === "true") {
        resolve();
        return;
      }

      existingScript.addEventListener("load", () => resolve(), { once: true });
      existingScript.addEventListener(
        "error",
        () => reject(new Error(`Failed to load script: ${src}`)),
        { once: true },
      );
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = false;
    script.addEventListener(
      "load",
      () => {
        script.dataset.loaded = "true";
        resolve();
      },
      { once: true },
    );
    script.addEventListener(
      "error",
      () => reject(new Error(`Failed to load script: ${src}`)),
      { once: true },
    );
    document.body.appendChild(script);
  });
}

async function loadLegacyScripts() {
  for (const src of LEGACY_SCRIPT_SOURCES) {
    await loadScript(src);
  }
}

// ─── Launch splash ────────────────────────────────────────────
// The markup lives in index.html so it paints on the very first frame. It
// stays up while the game autostarts (covering the setup page, the intro
// video and the black gap before the first game frame) and fades out once
// there is something real to show.
const splash = (() => {
  const el = document.getElementById("app-splash");
  const fill = el?.querySelector(".splash-bar-fill");
  const prompt = document.getElementById("splash-prompt");
  let hidden = false;

  return {
    hide() {
      if (!el || hidden) return;
      hidden = true;
      el.classList.add("is-hidden");
      window.setTimeout(() => el.remove(), 700);
    },
    setProgress(percent) {
      if (!el || !fill || hidden) return;
      el.classList.remove("is-indeterminate");
      fill.style.width = `${percent}%`;
    },
    setIndeterminate() {
      if (!el || hidden) return;
      el.classList.add("is-indeterminate");
    },
    showPrompt(text) {
      if (!el || !prompt || hidden) return;
      prompt.textContent = text;
      el.classList.add("is-prompt");
    },
    clearPrompt() {
      el?.classList.remove("is-prompt");
    },
    // The game is launching, so the setup gear is no longer offered.
    lockManage() {
      el?.classList.add("is-launching");
    },
    onManage(handler) {
      const button = document.getElementById("splash-manage");
      if (!button) return;
      // The engine launches on a window-level click/pointerup, so keep the
      // gear's own taps from reaching it.
      button.addEventListener("pointerup", (event) => event.stopPropagation());
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        handler();
      });
    },
  };
})();

// True when the browser lets audio start without a tap (for example an
// installed PWA on Android). When it does, the "click to continue" step that
// only exists to unlock audio can be skipped.
async function canAutoplayAudio() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return false;
  let context;
  try {
    context = new AudioContextClass();
    if (context.state !== "running") {
      await Promise.race([
        context.resume().catch(() => {}),
        new Promise((resolve) => window.setTimeout(resolve, 250)),
      ]);
    }
    return context.state === "running";
  } catch {
    return false;
  } finally {
    context?.close().catch(() => {});
  }
}

// Mirror the loader's download bar onto the splash.
function mirrorLoaderProgress() {
  const fillEl = document.querySelector("#spinner .progress-bar-fill");
  if (!fillEl) return;
  new MutationObserver(() => {
    const percent = parseFloat(fillEl.style.width);
    if (Number.isFinite(percent)) splash.setProgress(percent);
  }).observe(fillEl, { attributes: true, attributeFilter: ["style"] });
}

// Keep the splash up after the game is launched until the engine is actually
// running, then fade it out once a frame or two has been drawn.
let watchingForGameStart = false;
function hideSplashWhenGameRuns() {
  if (watchingForGameStart) return;
  watchingForGameStart = true;
  const statusEl = document.getElementById("status");
  let done = false;
  let observer;

  const finish = () => {
    if (done) return;
    done = true;
    observer?.disconnect();
    window.removeEventListener("error", finish);
    splash.hide();
  };

  if (statusEl) {
    observer = new MutationObserver(() => {
      // The engine reports "Running..." right before its main loop starts.
      if (!/^Running/i.test(statusEl.textContent || "")) return;
      observer.disconnect();
      requestAnimationFrame(() =>
        requestAnimationFrame(() => window.setTimeout(finish, 200)),
      );
    });
    observer.observe(statusEl, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }

  // Never leave the screen covered: show errors, and give up after a while.
  window.addEventListener("error", finish);
  window.setTimeout(finish, 45000);
}

async function autoStartGame() {
  const intro = document.querySelector(".intro");
  // The splash covers the intro video, so don't let its soundtrack play unseen.
  if (intro) intro.muted = true;

  mirrorLoaderProgress();

  const [audioAllowed] = await Promise.all([
    canAutoplayAudio(),
    window.startGame({ stopPropagation() {} }),
  ]);

  // Give the user a moment to reach the setup gear before the game launches
  // by itself (a fast data load would otherwise skip straight past it).
  if (audioAllowed) {
    const grace = 2500 - performance.now();
    if (grace > 0) await new Promise((resolve) => window.setTimeout(resolve, grace));
  }
  if (leavingForSetup) return;

  // startGame has finished loading the data and is now waiting for a click
  // (desktop) or pointerup (mobile) before launching the engine.
  if (audioAllowed) {
    splash.lockManage();
    hideSplashWhenGameRuns();
    splash.setIndeterminate();
    window.dispatchEvent(new Event("click"));
    window.dispatchEvent(new Event("pointerup"));
    return;
  }

  // Audio needs a real tap to unlock, so ask for it on the splash itself.
  splash.showPrompt(t("loader.clickToContinue"));
  const onContinue = () => {
    splash.lockManage();
    hideSplashWhenGameRuns();
    splash.clearPrompt();
    splash.setIndeterminate();
  };
  window.addEventListener("click", onContinue, { once: true });
  window.addEventListener("pointerup", onContinue, { once: true });
}

// Returns null if OK, or a string describing the failure reason.
async function checkReady() {
  try {
    const root = await navigator.storage.getDirectory();

    let markerFile;
    try {
      const fh = await root.getFileHandle("_game_ready");
      markerFile = await fh.getFile();
    } catch {
      return "OPFS marker '_game_ready' not found";
    }

    const version = await markerFile.text();
    if (version !== "v4") {
      return `OPFS marker version mismatch: got "${version}", expected "v4"`;
    }

    const requiredFiles = [
      ["vcbr", "vc-sky-en-v6.data", 100 * 1024 * 1024],
      ["vcbr", "vc-sky-en-v6.wasm", 0],
      ["vcsky", "sha256sums.txt", 0],
    ];

    for (const [directoryName, fileName, minSize] of requiredFiles) {
      let dir;
      try {
        dir = await root.getDirectoryHandle(directoryName);
      } catch {
        return `OPFS directory not found: ${directoryName}/`;
      }
      let fh;
      try {
        fh = await dir.getFileHandle(fileName);
      } catch {
        return `OPFS file not found: ${directoryName}/${fileName}`;
      }
      if (minSize > 0) {
        const f = await fh.getFile();
        if (f.size < minSize) {
          return `OPFS file too small: ${directoryName}/${fileName} is ${(f.size / 1024 / 1024).toFixed(1)} MB, need > ${minSize / 1024 / 1024} MB`;
        }
      }
    }

    return null;
  } catch (err) {
    return `checkReady error: ${err.message}`;
  }
}

// Returns null if OK, or a string describing the failure reason.
async function verifyGameServing() {
  const requiredUrls = [
    "/vcbr/vc-sky-en-v6.data",
    "/vcbr/vc-sky-en-v6.wasm",
    "/vcsky/sha256sums.txt",
  ];

  try {
    for (const url of requiredUrls) {
      let response;
      try {
        response = await fetch(url, { method: "HEAD", cache: "no-store" });
      } catch (err) {
        return `fetch failed for ${url}: ${err.message}`;
      }
      if (!response.ok) {
        return `SW served ${response.status} for ${url}`;
      }
    }

    return null;
  } catch (err) {
    return `verifyGameServing error: ${err.message}`;
  }
}

async function waitForGameReady(retries = 6, delayMs = 400) {
  let lastReason = "unknown";
  for (let attempt = 0; attempt < retries; attempt++) {
    const opfsReason = await checkReady();
    if (opfsReason !== null) {
      lastReason = opfsReason;
      console.warn(`[waitForGameReady] attempt ${attempt + 1}: ${opfsReason}`);
    } else {
      const servingReason = await verifyGameServing();
      if (servingReason !== null) {
        lastReason = servingReason;
        console.warn(`[waitForGameReady] attempt ${attempt + 1}: ${servingReason}`);
      } else {
        return { ready: true, reason: null };
      }
    }

    if (attempt < retries - 1) {
      await new Promise((resolve) => window.setTimeout(resolve, delayMs));
    }
  }

  return { ready: false, reason: lastReason };
}

async function clearGameFiles() {
  // Clear OPFS: delete all known directories and the marker file
  try {
    const root = await navigator.storage.getDirectory();
    for (const name of ["vcbr", "vcsky", "_game_ready"]) {
      try {
        await root.removeEntry(name, { recursive: true });
      } catch {
        // entry may not exist
      }
    }
  } catch (err) {
    console.warn("[reset] OPFS clear failed:", err);
  }
}

async function initSetupFlow() {
  const overlay = document.getElementById("setup-overlay");
  const downloadLink = document.getElementById("dl-link");
  const fileInput = document.getElementById("game-file-input");
  const progress = document.getElementById("setup-progress");
  const progressBar = document.getElementById("setup-progress-bar");
  const progressLabel = document.getElementById("setup-progress-label");
  const progressPercent = document.getElementById("setup-progress-percent");
  const errorBox = document.getElementById("setup-error");
  const storageStatus = document.getElementById("storage-status");
  const selectedFileName = document.getElementById("selected-file-name");
  const clickToPlayButton = document.getElementById("click-to-play-button");
  const resetFilesBtn = document.getElementById("reset-files-btn");

  if (
    !overlay ||
    !downloadLink ||
    !fileInput ||
    !progress ||
    !progressBar ||
    !progressLabel ||
    !progressPercent ||
    !errorBox ||
    !storageStatus ||
    !selectedFileName ||
    !clickToPlayButton
  ) {
    return;
  }

  if (ASSET_RELEASE_URL) {
    downloadLink.href = ASSET_RELEASE_URL;
  } else {
    // No archive URL configured for this build (VITE_ASSET_URL unset).
    downloadLink.style.display = "none";
  }

  const showError = (key, options) => {
    errorBox.style.display = "block";
    setText(errorBox, key, options);
  };

  const setStorageStatus = (key, state) => {
    setText(storageStatus, key);
    storageStatus.dataset.state = state;
  };

  const setPlayAvailability = (enabled) => {
    window.__gtaGameReady = enabled;
    clickToPlayButton.disabled = !enabled;
    clickToPlayButton.classList.toggle("disabled", !enabled);
  };

  if (resetFilesBtn) {
    resetFilesBtn.addEventListener("click", async () => {
      if (!confirm(t("setup.resetFilesConfirm"))) {
        return;
      }
      resetFilesBtn.disabled = true;
      setText(resetFilesBtn, "setup.resetting");
      await clearGameFiles();
      setStorageStatus("status.missing", "missing");
      setPlayAvailability(false);
      progress.style.display = "none";
      errorBox.style.display = "none";
      setText(selectedFileName, "setup.noFile");
      fileInput.value = "";
      resetFilesBtn.disabled = false;
      setText(resetFilesBtn, "setup.resetFiles");
    });
  }

  // Neither reset nor a second import may run while the worker is still
  // writing to OPFS. The download link stays usable.
  const filePicker = document.querySelector(`label[for="${fileInput.id}"]`);
  const setImporting = (importing) => {
    fileInput.disabled = importing;
    filePicker?.classList.toggle("disabled", importing);
    if (resetFilesBtn) resetFilesBtn.disabled = importing;
  };

  const runImport = async (file) => {
    errorBox.style.display = "none";
    setImporting(true);
    progress.style.display = "block";
    setText(progressLabel, "progress.readingFile");
    progressPercent.textContent = "0%";
    progressBar.style.width = "0%";
    setPlayAvailability(false);

    const worker = new Worker(`${BASE}extract-worker.js`);
    worker.onerror = (error) => {
      console.error("[worker error]", error);
      showError("errors.worker", { message: error.message });
      setImporting(false);
    };
    worker.postMessage({ file });
    worker.onmessage = async (event) => {
      const message = event.data;

      if (message.type === "progress") {
        progressBar.style.width = `${message.pct}%`;
        progressPercent.textContent = `${message.pct}%`;
        const labels = {
          reading: "progress.reading",
          decompressing: "progress.decompressing",
          extracting: "progress.extracting",
        };
        setText(progressLabel, labels[message.phase] || "progress.working", {
          done: message.done || 0,
          total: message.total || "",
        });
        return;
      }

      if (message.type === "done") {
        progressBar.style.width = "100%";
        progressPercent.textContent = "100%";
        setText(progressLabel, "progress.verifying");
        const { ready: isReady, reason } = await waitForGameReady();
        setStorageStatus(
          isReady ? "status.ready" : "status.missing",
          isReady ? "ready" : "missing",
        );
        setPlayAvailability(isReady);
        if (isReady) setText(progressLabel, "progress.complete");
        else {
          setText(progressLabel, "progress.verifyFailed", { reason });
            }
        setImporting(false);
        worker.terminate();
        return;
      }

      if (message.type === "error") {
        showError("errors.generic", { message: message.message });
          setImporting(false);
        worker.terminate();
      }
    };
  };

  setPlayAvailability(false);

  if (
    !("serviceWorker" in navigator) ||
    !("storage" in navigator && navigator.storage.getDirectory)
  ) {
    setStorageStatus("status.unsupported", "error");
    showError("errors.apis");
    return;
  }

  try {
    if (isLocalDevEnvironment()) {
      console.log("[setup] local dev detected, refreshing SW registration");
      await clearDevelopmentServiceWorkers();
    }

    console.log("[setup] registering SW...");
    await navigator.serviceWorker.register(`${BASE}sw.js`, { updateViaCache: "none" });
    await navigator.serviceWorker.ready;
    console.log("[setup] SW ready");

    if (!navigator.serviceWorker.controller) {
      console.log("[setup] SW not yet controlling page — reloading...");
      pageReloading = true;
      window.location.reload();
      return;
    }
  } catch (error) {
    setStorageStatus("status.loadFailed", "error");
    showError("errors.serviceWorker", { message: error.message });
    return;
  }

  // Attach before the ready check so a file can still be imported after
  // "Reset game data" without reloading the page.
  fileInput.addEventListener("change", async () => {
    console.log("[setup] file selected:", fileInput.files[0]?.name);
    const file = fileInput.files[0];
    if (!file) {
      setText(selectedFileName, "setup.noFile");
      return;
    }

    setRawText(selectedFileName, file.name);

    if (!/\.tar\.gz$|\.gz$/i.test(file.name)) {
      showError("errors.wrongFile");
      return;
    }

    await runImport(file);
  });

  const { ready, reason } = await waitForGameReady(2, 150);
  console.log("[setup] game ready in OPFS:", ready, reason || "");
  if (ready) {
    setStorageStatus("status.ready", "ready");
    setPlayAvailability(true);
    progress.style.display = "none";
    return true;
  }

  setStorageStatus("status.missing", "missing");

  console.log("[setup] waiting for file selection");
}

function initCanvasBindings() {
  const canvas = document.getElementById("canvas");
  if (!canvas) {
    return;
  }

  canvas.addEventListener("contextmenu", (event) => {
    event.preventDefault();
  });
}

function checkBrowserCompatibility() {
  const missing = [];

  if (!("serviceWorker" in navigator)) missing.push("Service Workers");
  if (!("storage" in navigator) || !("getDirectory" in navigator.storage)) missing.push("OPFS");
  if (typeof WebAssembly === "undefined") missing.push("WebAssembly");
  if (typeof Worker === "undefined") missing.push("Web Workers");

  return missing;
}

function initOrientationLock() {
  const observer = new MutationObserver(() => {
    if (document.body.classList.contains("gameIsStarted")) {
      observer.disconnect();
      screen.orientation?.lock("landscape").catch(() => {});
    }
  });
  observer.observe(document.body, { attributeFilter: ["class"] });
}

function initLanguagePicker() {
  const select = document.getElementById("ui-lang");
  if (!select) return;

  select.replaceChildren(
    ...LANGUAGES.map(({ code, label }) => new Option(label, code)),
  );
  select.value = currentLanguage();
  select.addEventListener("change", () => {
    void changeLanguage(select.value);
  });
}

async function boot() {
  splash.onManage(() => {
    leavingForSetup = true;
    try {
      sessionStorage.setItem(SETUP_FLAG, "1");
    } catch {
      // storage unavailable: the reload below just autostarts again
    }
    window.location.reload();
  });
  applyTranslations();
  initLanguagePicker();
  initCanvasBindings();
  initOrientationLock();

  const missing = checkBrowserCompatibility();
  if (missing.length > 0) {
    const storageStatus = document.getElementById("storage-status");
    const errorBox = document.getElementById("setup-error");
    if (storageStatus) {
      setText(storageStatus, "status.unsupported");
      storageStatus.dataset.state = "error";
    }
    if (errorBox) {
      errorBox.style.display = "block";
      setText(errorBox, "errors.missingFeatures", { features: missing.join(", ") });
    }
    splash.hide();
    return;
  }

  // True when the game is already stored in OPFS and ready to run.
  const autoStart = await initSetupFlow();
  if (pageReloading) return;
  const openSetup = takeSetupFlag();
  try {
    await loadLegacyScripts();
  } catch (err) {
    showScriptLoadError(err);
    splash.hide();
    return;
  }

  // Game files are already saved locally, so skip the Start button.
  if (
    autoStart &&
    !openSetup &&
    !leavingForSetup &&
    window.__gtaGameReady === true &&
    typeof window.startGame === "function"
  ) {
    try {
      await autoStartGame();
    } catch (err) {
      console.error("[boot] autostart failed:", err);
      splash.hide();
    }
    return;
  }

  // Setup screen is needed (no game saved yet, or something went wrong).
  splash.hide();
}

// A script can fail to load right after a deploy, when the browser still has
// the previous page cached but the files it asks for are gone. Say so instead
// of leaving a Start button that does nothing.
function showScriptLoadError(err) {
  console.error("[boot] failed to load a game script:", err);
  const file = String(err && err.message).split("/").pop();

  const startButton = document.getElementById("click-to-play-button");
  if (startButton) {
    startButton.disabled = true;
    startButton.classList.add("disabled");
  }
  const storageStatus = document.getElementById("storage-status");
  if (storageStatus) {
    setText(storageStatus, "status.loadFailed");
    storageStatus.dataset.state = "error";
  }
  const errorBox = document.getElementById("setup-error");
  if (errorBox) {
    errorBox.style.display = "block";
    setText(errorBox, "errors.scriptLoad", { file });
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    void boot();
  });
} else {
  void boot();
}
