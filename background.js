// ============================================================
// Nightfall – Background Service Worker
// Manages extension state, per-site settings, and messaging
// ============================================================

const DEFAULT_SETTINGS = {
  globalEnabled: false, // Off by default
  brightness: 100,
  contrast: 100,
  selectorMode: false, // Element picker off by default
  siteOverrides: {}, // Per-site toggle overrides
};

// Initialize default settings and context menus on install
browser.runtime.onInstalled.addListener(async () => {
  const existing = await browser.storage.local.get("nightfallSettings");
  if (!existing.nightfallSettings) {
    await browser.storage.local.set({ nightfallSettings: DEFAULT_SETTINGS });
  }

  // Create custom context menu for images
  browser.contextMenus.create({
    id: "save-to-nightfall",
    title: "Save Image to Nightfall Clipboard",
    contexts: ["image"],
  });
});

// Reusable function to capture and save images
async function captureAndSaveImage(src, sendResponse = null) {
  try {
    const response = await fetch(src);
    const blob = await response.blob();
    const reader = new FileReader();

    return new Promise((resolve, reject) => {
      reader.onload = async () => {
        const data = reader.result;
        const { nightfallClipboard } =
          await browser.storage.local.get("nightfallClipboard");
        let clipboardItems = nightfallClipboard || [];

        // Deduplicate
        if (clipboardItems.length > 0 && clipboardItems[0].data === data) {
          const res = { success: true, duplicated: true };
          if (sendResponse) sendResponse(res);
          resolve(res);
          return;
        }

        clipboardItems.unshift({
          type: "image",
          data: data,
          timestamp: Date.now(),
        });

        if (clipboardItems.length > 50) {
          clipboardItems = clipboardItems.slice(0, 50);
        }

        await browser.storage.local.set({ nightfallClipboard: clipboardItems });

        // Notify the popup if it's open
        try {
          await browser.runtime.sendMessage({ type: "CLIPBOARD_UPDATED" });
        } catch (e) {}

        const res = { success: true };
        if (sendResponse) sendResponse(res);
        resolve(res);
      };
      reader.onerror = () => reject(new Error("File reader error"));
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    console.error("Nightfall: Background image capture failed", err);
    const res = { success: false, error: err.message };
    if (sendResponse) sendResponse(res);
    throw err;
  }
}

// Context Menu Listener
browser.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "save-to-nightfall" && info.srcUrl) {
    await captureAndSaveImage(info.srcUrl);
  }
});

// Get hostname from URL
function getHostname(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

// Determine if dark mode should be active for a given site
async function isDarkModeActive(hostname) {
  const { nightfallSettings } =
    await browser.storage.local.get("nightfallSettings");
  const settings = nightfallSettings || DEFAULT_SETTINGS;

  // Check site-specific override first
  if (hostname && settings.siteOverrides[hostname] !== undefined) {
    return settings.siteOverrides[hostname];
  }

  return settings.globalEnabled;
}

// Listen for messages from popup and content scripts
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "GET_SETTINGS") {
    browser.storage.local.get("nightfallSettings").then((result) => {
      sendResponse(result.nightfallSettings || DEFAULT_SETTINGS);
    });
    return true; // async response
  }

  if (message.type === "UPDATE_SETTINGS") {
    browser.storage.local.get("nightfallSettings").then(async (result) => {
      const current = result.nightfallSettings || DEFAULT_SETTINGS;
      const updated = { ...current, ...message.settings };
      await browser.storage.local.set({ nightfallSettings: updated });

      // Notify all tabs about the change
      const tabs = await browser.tabs.query({});
      for (const tab of tabs) {
        try {
          await browser.tabs.sendMessage(tab.id, {
            type: "SETTINGS_CHANGED",
            settings: updated,
          });
        } catch (e) {
          // Tab might not have content script loaded
        }
      }

      sendResponse(updated);
    });
    return true;
  }

  if (message.type === "GET_SITE_STATUS") {
    const hostname = message.hostname;
    isDarkModeActive(hostname).then((active) => {
      sendResponse({ active });
    });
    return true;
  }

  if (message.type === "TOGGLE_SITE") {
    browser.storage.local.get("nightfallSettings").then(async (result) => {
      const current = result.nightfallSettings || DEFAULT_SETTINGS;
      const hostname = message.hostname;
      const newOverrides = { ...current.siteOverrides };

      if (message.enabled !== undefined) {
        newOverrides[hostname] = message.enabled;
      } else {
        // Toggle
        const currentlyActive = await isDarkModeActive(hostname);
        newOverrides[hostname] = !currentlyActive;
      }

      const updated = { ...current, siteOverrides: newOverrides };
      await browser.storage.local.set({ nightfallSettings: updated });

      // Notify the specific tab
      const tabs = await browser.tabs.query({
        active: true,
        currentWindow: true,
      });
      for (const tab of tabs) {
        try {
          await browser.tabs.sendMessage(tab.id, {
            type: "SETTINGS_CHANGED",
            settings: updated,
          });
        } catch (e) {}
      }

      sendResponse(updated);
    });
    return true;
  }

  if (message.type === "SAVE_ELEMENT_RULES") {
    const hostname = message.hostname;
    browser.storage.local.get("nightfallElementRules").then(async (result) => {
      const rules = result.nightfallElementRules || {};
      rules[hostname] = message.selectors || [];
      await browser.storage.local.set({ nightfallElementRules: rules });
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.type === "GET_ELEMENT_RULES") {
    const hostname = message.hostname;
    browser.storage.local.get("nightfallElementRules").then((result) => {
      const rules = result.nightfallElementRules || {};
      sendResponse(rules[hostname] || []);
    });
    return true;
  }

  if (message.type === "TOGGLE_SELECTOR_MODE") {
    browser.tabs
      .query({ active: true, currentWindow: true })
      .then(async (tabs) => {
        for (const tab of tabs) {
          try {
            await browser.tabs.sendMessage(tab.id, {
              type: "SELECTOR_MODE",
              enabled: message.enabled,
            });
          } catch (e) {}
        }
        sendResponse({ success: true });
      });
    return true;
  }

  if (message.type === "CAPTURE_IMAGE") {
    captureAndSaveImage(message.src, sendResponse);
    return true;
  }
});
