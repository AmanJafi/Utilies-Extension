document.addEventListener("DOMContentLoaded", async () => {
  // Rely on NightfallStorage from storage.js linked in HTML
  if (
    !window.NightfallStorage &&
    chrome &&
    chrome.extension &&
    chrome.extension.getBackgroundPage
  ) {
    // Fallback for some environments
    const bg = chrome.extension.getBackgroundPage();
    if (bg && bg.NightfallStorage) {
      window.NightfallStorage = bg.NightfallStorage;
    }
  }

  // In MV3, storage is accessible directly, but if NightfallStorage isn't defined,
  // let's define a local copy for the options page.
  const Storage = window.NightfallStorage || {
    async getConfig() {
      const data = await browser.storage.local.get("nightfallKeybinds");
      let config = data.nightfallKeybinds || {
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
      };

      // Migration from old object format to array format
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
      }
      return config;
    },
    async saveConfig(config) {
      await browser.storage.local.set({ nightfallKeybinds: config });
      const tabs = await browser.tabs.query({});
      for (const tab of tabs) {
        try {
          await browser.tabs.sendMessage(tab.id, {
            type: "KEYBINDINGS_CHANGED",
            config: config,
          });
        } catch (e) {}
      }
    },
  };

  let currentConfig = await Storage.getConfig();

  const modesEnabledToggle = document.getElementById("modes-enabled");
  const keybindsContainer = document.getElementById("keybinds-container");
  const saveBtn = document.getElementById("save-btn");
  const resetBtn = document.getElementById("reset-btn");
  const addBtn = document.getElementById("add-keybind-btn");

  const actionLabels = {
    scrollDown: "Scroll Down",
    scrollUp: "Scroll Up",
    scrollLeft: "Scroll Left",
    scrollRight: "Scroll Right",
    pageDown: "Page Down",
    pageUp: "Page Up",
    scrollTop: "Scroll to Top",
    scrollBottom: "Scroll to Bottom",
    moveLeft: "Caret Left",
    moveRight: "Caret Right",
    moveUp: "Caret Up",
    moveDown: "Caret Down",
    moveLineStart: "Caret to Start",
    moveLineEnd: "Caret to End",
    deleteChar: "Delete Character",
    deleteLine: "Delete Whole Line",
    undo: "Undo",
    redo: "Redo",
    enterInsert: "Enter Insert Mode",
    enterInsertEnd: "Insert at Line Start",
    enterAppend: "Enter Append Mode",
    enterAppendEnd: "Append at Line End",
  };

  function renderKeybinds() {
    keybindsContainer.innerHTML = "";

    currentConfig.keybindings.forEach((binding, index) => {
      const row = document.createElement("div");
      row.className = "keybind-row";

      let selectHtml = `<select class="action-select" data-index="${index}">`;
      for (const [val, label] of Object.entries(actionLabels)) {
        selectHtml += `<option value="${val}" ${binding.action === val ? "selected" : ""}>${label}</option>`;
      }
      selectHtml += `</select>`;

      row.innerHTML = `
          <div class="keybind-info">
            ${selectHtml}
          </div>
          <div class="keybind-controls">
            <input type="text" class="key-input" data-index="${index}" value="${binding.key || ""}" readonly>
            <label class="toggle">
              <input type="checkbox" class="keybind-toggle" data-index="${index}" ${binding.enabled ? "checked" : ""}>
              <span class="slider"></span>
            </label>
            <button class="remove-keybind" data-index="${index}" title="Remove binding">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        `;
      keybindsContainer.appendChild(row);
    });

    // Key recorder: captures single keys OR modifier combos
    document.querySelectorAll(".key-input").forEach((input) => {
      input.addEventListener("keydown", (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (e.key === "Tab") return;

        if (e.key === "Backspace" || e.key === "Delete") {
          input.value = "";
          updateBindingFromRow(input.dataset.index);
          return;
        }

        // Skip bare modifier keypresses
        if (["Control", "Alt", "Shift", "Meta"].includes(e.key)) return;

        // Build canonical string e.g. "ctrl+shift+k"
        const parts = [];
        if (e.ctrlKey)  parts.push("ctrl");
        if (e.altKey)   parts.push("alt");
        if (e.shiftKey && e.key.length > 1) parts.push("shift");
        parts.push(e.key);
        const keyStr = parts.join("+");

        // Two-char sequences: if user presses same single char twice, append ("g" -> "gg")
        const existing = input.value;
        if (existing.length > 0 && !existing.includes("+") && keyStr === existing) {
          input.value = existing + existing;
        } else {
          input.value = keyStr;
        }

        updateBindingFromRow(input.dataset.index);
      });
      input.addEventListener("click", () => {
        input.select();
      });
    });

    // Setup listeners for select changes
    document.querySelectorAll(".action-select").forEach((select) => {
      select.addEventListener("change", () => {
        updateBindingFromRow(select.dataset.index);
      });
    });

    // Setup listeners for toggles
    document.querySelectorAll(".keybind-toggle").forEach((toggle) => {
      toggle.addEventListener("change", () => {
        updateBindingFromRow(toggle.dataset.index);
      });
    });

    // Setup listeners for remove buttons
    document.querySelectorAll(".remove-keybind").forEach((btn) => {
      btn.addEventListener("click", () => {
        const index = parseInt(btn.dataset.index);
        currentConfig.keybindings.splice(index, 1);
        renderKeybinds();
      });
    });
  }

  function updateBindingFromRow(index) {
    const row = keybindsContainer.children[index];
    const select = row.querySelector(".action-select");
    const input = row.querySelector(".key-input");
    const toggle = row.querySelector(".keybind-toggle");

    currentConfig.keybindings[index] = {
      action: select.value,
      key: input.value,
      enabled: toggle.checked,
    };
  }

  function initUI() {
    modesEnabledToggle.checked = currentConfig.modesEnabled;
    renderKeybinds();
  }

  initUI();

  // Add Keybind
  addBtn.addEventListener("click", () => {
    currentConfig.keybindings.push({
      action: "scrollDown",
      key: "",
      enabled: true,
    });
    renderKeybinds();
    // Focus the new input
    const inputs = document.querySelectorAll(".key-input");
    inputs[inputs.length - 1].focus();
  });

  // Save Settings
  saveBtn.addEventListener("click", async () => {
    currentConfig.modesEnabled = modesEnabledToggle.checked;
    // Bindings are already updated in render/listeners but let's be sure
    await Storage.saveConfig(currentConfig);

    const originalText = saveBtn.textContent;
    saveBtn.textContent = "Saved!";
    setTimeout(() => (saveBtn.textContent = originalText), 1500);
  });

  // Reset Settings
  resetBtn.addEventListener("click", async () => {
    currentConfig = {
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
    };
    await Storage.saveConfig(currentConfig);
    initUI();
  });
});
