// ============================================================
// Nightfall – Storage Manager for Keybindings
// Handles saving and loading keybinding configurations via browser.storage
// ============================================================

const NightfallStorage = {
  DEFAULT_CONFIG: {
    modesEnabled: true,
    keybindings: [
      { action: "scrollDown", key: "j", enabled: true },
      { action: "scrollUp", key: "k", enabled: true },
      { action: "scrollLeft", key: "h", enabled: true },
      { action: "scrollRight", key: "l", enabled: true },
      { action: "pageDown", key: "dd", enabled: true },
      { action: "pageUp", key: "u", enabled: true },
      { action: "scrollTop", key: "gg", enabled: true },
      { action: "scrollBottom", key: "G", enabled: true },
      { action: "deleteChar", key: "x", enabled: true },
      { action: "undo", key: "u", enabled: true },
      { action: "redo", key: "r", enabled: true },
      { action: "enterInsert", key: "i", enabled: true },
      { action: "enterInsertEnd", key: "I", enabled: true },
      { action: "enterAppend", key: "a", enabled: true },
      { action: "enterAppendEnd", key: "A", enabled: true },
      { action: "deleteLine", key: "dd", enabled: true },
    ],
  },

  async getConfig() {
    try {
      const data = await browser.storage.local.get("nightfallKeybinds");
      let config = data.nightfallKeybinds;

      if (!config) {
        return JSON.parse(JSON.stringify(this.DEFAULT_CONFIG));
      }

      // Migration: Convert old object-based format to new array-based format
      if (config.keybindings && !Array.isArray(config.keybindings)) {
        const oldBindings = config.keybindings;
        const oldEnabled = config.enabled || {};
        const newBindings = [];
        for (const [action, key] of Object.entries(oldBindings)) {
          newBindings.push({
            action: action,
            key: key,
            enabled: oldEnabled[action] !== false,
          });
        }
        config.keybindings = newBindings;
        delete config.enabled;

        // Save the migrated config back to storage
        await browser.storage.local.set({ nightfallKeybinds: config });
      }

      return config;
    } catch (e) {
      console.error("Nightfall: Error loading config", e);
      return JSON.parse(JSON.stringify(this.DEFAULT_CONFIG));
    }
  },

  async saveConfig(config) {
    try {
      await browser.storage.local.set({ nightfallKeybinds: config });
      // Notify content scripts of changes
      const tabs = await browser.tabs.query({});
      for (const tab of tabs) {
        try {
          await browser.tabs.sendMessage(tab.id, {
            type: "KEYBINDINGS_CHANGED",
            config: config,
          });
        } catch (e) {
          // Tab might not have content script
        }
      }
    } catch (e) {
      console.error("Nightfall: Error saving config", e);
    }
  },

  async resetConfig() {
    await this.saveConfig(this.DEFAULT_CONFIG);
  },
};

// If used in a module environment or extension context
if (typeof window !== "undefined") {
  window.NightfallStorage = NightfallStorage;
}
