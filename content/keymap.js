// ============================================================
// Nightfall – Keymap Logic
// Maps user sequence input to actions according to config
// ============================================================

const NightfallKeymap = {
  keyBuffer: "",
  bufferTimeout: null,
  BUFFER_TIMEOUT_MS: 600, // tighter timeout keeps it snappy

  clearBuffer() {
    this.keyBuffer = "";
    if (this.bufferTimeout) {
      clearTimeout(this.bufferTimeout);
      this.bufferTimeout = null;
    }
  },

  _armTimeout() {
    if (this.bufferTimeout) clearTimeout(this.bufferTimeout);
    this.bufferTimeout = setTimeout(() => {
      this.keyBuffer = "";
      this.bufferTimeout = null;
    }, this.BUFFER_TIMEOUT_MS);
  },

  /**
   * Builds a canonical key string from a KeyboardEvent, supporting modifiers.
   * e.g. Ctrl+Shift+K  ->  "ctrl+shift+k"
   *      just "j"      ->  "j"
   */
  eventToKeyString(e) {
    const parts = [];
    if (e.ctrlKey)  parts.push("ctrl");
    if (e.altKey)   parts.push("alt");
    if (e.shiftKey && e.key.length > 1) parts.push("shift"); // avoid "shift+J" -> use capital "J"
    parts.push(e.key);
    return parts.join("+");
  },

  /**
   * Evaluates if current key or buffer matches an action.
   * @param {KeyboardEvent} e   - the raw keyboard event
   * @param {Object}        config - keybinding config object
   * @returns {string|null}  Action name | "PENDING" | null
   */
  getAction(e, config) {
    if (!config || !config.modesEnabled) return null;

    const bindings = config.keybindings; // [{action, key, enabled}]

    // Build the keystroke string (supports modifier combos)
    const keystroke = this.eventToKeyString(e);

    // Append to buffer
    this.keyBuffer += (this.keyBuffer ? "+" : "") + keystroke;

    // We treat the *whole* buffer as a sequence, e.g. "g" then "g" -> "g+g"
    // But for single-char sequences like "j", buffer is just "j"
    const buffered = this.keyBuffer;

    // 1. Exact full match
    for (const binding of bindings) {
      if (binding.enabled && binding.key === buffered) {
        this.clearBuffer();
        return binding.action;
      }
    }

    // 2. Are there any bindings that START with the current buffer?
    //    (i.e. we need to keep waiting for more keys)
    let hasPending = false;
    for (const binding of bindings) {
      if (binding.enabled && binding.key !== buffered && binding.key.startsWith(buffered)) {
        hasPending = true;
        break;
      }
    }

    if (hasPending) {
      this._armTimeout();
      return "PENDING";
    }

    // No match and no pending → clear and return null
    this.clearBuffer();
    return null;
  },
};

if (typeof window !== "undefined") {
  window.NightfallKeymap = NightfallKeymap;
}
