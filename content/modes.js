// ============================================================
// Nightfall – Modes Manager
// Manages editing states: Normal, Insert, Visual
// ============================================================

const NightfallModes = {
  MODES: {
    NORMAL: "NORMAL",
    INSERT: "INSERT",
    VISUAL: "VISUAL"
  },

  currentMode: "NORMAL",
  config: null,

  async init() {
    this.config = await NightfallStorage.getConfig();

    // Listen for config updates
    browser.runtime.onMessage.addListener((message) => {
      if (message.type === 'KEYBINDINGS_CHANGED') {
        this.config = message.config;
      }
    });
  },

  getMode() {
    // If modal behaviour is globally disabled, always act as INSERT (i.e., ignore vim bindings)
    if (this.config && !this.config.modesEnabled) {
      return this.MODES.INSERT;
    }
    return this.currentMode;
  },

  setMode(mode) {
    if (!Object.values(this.MODES).includes(mode)) return;
    this.currentMode = mode;
    this.updateUIIndicator();
  },

  updateUIIndicator() {
    // Optional: Could add a small fixed bottom-left indicator like " -- INSERT -- "
    // Keeping it simple and stealthy for now unless requested.
  },

  isEditable(element) {
    if (!element) return false;
    const tagName = element.tagName.toLowerCase();
    return (
      tagName === "input" ||
      tagName === "textarea" ||
      element.isContentEditable ||
      element.closest("[contenteditable='true']")
    );
  }
};

if (typeof window !== 'undefined') {
  window.NightfallModes = NightfallModes;
}
