// ============================================================
// Nightfall – Keymap Logic
// Maps user sequence input to actions according to config
// ============================================================

const NightfallKeymap = {
  keyBuffer: "",
  bufferTimeout: null,
  BUFFER_TIMEOUT_MS: 1000, // 1 second timeout for combos like 'gg'

  bufferKey(key) {
    this.keyBuffer += key;

    // Reset buffer after timeout
    if (this.bufferTimeout) clearTimeout(this.bufferTimeout);
    this.bufferTimeout = setTimeout(() => {
      this.keyBuffer = "";
    }, this.BUFFER_TIMEOUT_MS);

    return this.keyBuffer;
  },

  clearBuffer() {
    this.keyBuffer = "";
    if (this.bufferTimeout) clearTimeout(this.bufferTimeout);
  },

  /**
   * Evaluates if current key or buffer matches an action
   * @param {string} key - the single key pressed
   * @param {Object} config - keybinding config object
   * @returns {string|null} - Action name if matched, null otherwise
   */
  getAction(key, config) {
    if (!config || !config.modesEnabled) return null;

    const bindings = config.keybindings; // Expected to be an array [{action, key, enabled}]
    const buffered = this.bufferKey(key);

    // 1. Check exact buffer match. (e.g. "gg" or "dd")
    for (const binding of bindings) {
      if (binding.enabled && binding.key === buffered) {
        this.clearBuffer(); // Matched a full multi-key sequence
        return binding.action;
      }
    }

    // 2. Check single key match if buffer is just one char
    if (buffered.length === 1) {
      for (const binding of bindings) {
        if (binding.enabled && binding.key === key) {
          // We found a direct hit on a single key map (e.g. 'j').
          this.clearBuffer();
          return binding.action;
        }
      }
    }

    // 3. Pending Sequence Check
    // Are there any bindings that *start* with the current buffer?
    // E.g., if we typed 'g', 'gg' starts with it. So we hold and wait.
    let isPending = false;
    for (const binding of bindings) {
      if (binding.enabled && binding.key.startsWith(buffered)) {
        isPending = true;
        break;
      }
    }

    if (isPending) {
      // Don't execute anything yet, wait for next key or timeout
      return "PENDING";
    }

    // If no match and no pending sequence, clear buffer
    this.clearBuffer();
    return null;
  },
};

if (typeof window !== "undefined") {
  window.NightfallKeymap = NightfallKeymap;
}
