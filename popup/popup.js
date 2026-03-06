// ============================================================
// Nightfall – Popup Script
// Manages UI state, toggles, and element picker interaction
// ============================================================

(function () {
  "use strict";

  // DOM Elements
  const globalSwitch = document.getElementById("globalSwitch");
  const globalStatus = document.getElementById("globalStatus");
  const siteSwitch = document.getElementById("siteSwitch");
  const siteStatus = document.getElementById("siteStatus");
  const vimSwitch = document.getElementById("vimSwitch");
  const vimStatus = document.getElementById("vimStatus");
  const currentSiteEl = document.getElementById("currentSite");
  const pickerBtn = document.getElementById("pickerBtn");
  const pickerBtnText = document.getElementById("pickerBtnText");
  const rulesContainer = document.getElementById("rulesContainer");
  const rulesList = document.getElementById("rulesList");
  const clearRulesBtn = document.getElementById("clearRulesBtn");
  const optionsBtn = document.getElementById("optionsBtn");
  const clipboardList = document.getElementById("clipboardList");
  const clearClipboardBtn = document.getElementById("clearClipboardBtn");

  // Tab Elements
  const tabBtns = document.querySelectorAll(".nf-tab-btn");
  const tabContents = document.querySelectorAll(".nf-tab-content");

  let currentHostname = "";
  let pickerActive = false;

  // ── Initialize ──────────────────────────────────────────

  async function init() {
    try {
      // Get current tab info
      const tabs = await browser.tabs.query({
        active: true,
        currentWindow: true,
      });
      const tab = tabs[0];

      if (tab && tab.url) {
        try {
          const url = new URL(tab.url);
          currentHostname = url.hostname;
          currentSiteEl.textContent = currentHostname || "No site detected";
        } catch {
          currentSiteEl.textContent = "Internal page";
        }
      } else {
        currentSiteEl.textContent = "No site detected";
      }

      // Load settings
      const settings = await browser.runtime.sendMessage({
        type: "GET_SETTINGS",
      });
      applySettingsToUI(settings);

      // Load Neovim settings
      try {
        const data = await browser.storage.local.get("nightfallKeybinds");
        const config = data.nightfallKeybinds;
        const vimEnabled = config ? config.modesEnabled : true;

        vimSwitch.checked = vimEnabled;
        vimStatus.textContent = vimEnabled ? "On" : "Off";
        vimStatus.classList.toggle("active", vimEnabled);
      } catch (e) {
        console.error("Error loading vim settings:", e);
      }

      // Load element rules for current site
      loadRules();

      // Load clipboard items
      loadClipboard();
    } catch (e) {
      currentSiteEl.textContent = "Error loading";
      console.error("Nightfall init error:", e);
    }
  }

  function applySettingsToUI(settings) {
    if (!settings) return;

    // Global toggle
    globalSwitch.checked = settings.globalEnabled;
    globalStatus.textContent = settings.globalEnabled ? "On" : "Off";
    globalStatus.classList.toggle("active", settings.globalEnabled);

    // Site toggle
    const siteOverride = settings.siteOverrides[currentHostname];
    if (siteOverride !== undefined) {
      siteSwitch.checked = siteOverride;
      siteStatus.textContent = siteOverride ? "Enabled" : "Disabled";
      siteStatus.classList.toggle("active", siteOverride);
    } else {
      siteSwitch.checked = settings.globalEnabled;
      siteStatus.textContent = "Follows global";
      siteStatus.classList.toggle("active", settings.globalEnabled);
    }
  }

  // ── Tabs Switching ──────────────────────────────────────

  tabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      // Deactivate all
      tabBtns.forEach((b) => b.classList.remove("active"));
      tabContents.forEach((c) => c.classList.remove("active"));

      // Activate clicked
      btn.classList.add("active");
      const targetId = btn.getAttribute("data-tab");
      document.getElementById(targetId).classList.add("active");
    });
  });

  // ── Options Page ────────────────────────────────────────

  if (optionsBtn) {
    optionsBtn.addEventListener("click", () => {
      if (browser.runtime.openOptionsPage) {
        browser.runtime.openOptionsPage();
      } else {
        window.open(browser.runtime.getURL("options/options.html"));
      }
    });
  }

  // ── Global Toggle ───────────────────────────────────────

  globalSwitch.addEventListener("change", async () => {
    const enabled = globalSwitch.checked;
    globalStatus.textContent = enabled ? "On" : "Off";
    globalStatus.classList.toggle("active", enabled);

    const updated = await browser.runtime.sendMessage({
      type: "UPDATE_SETTINGS",
      settings: { globalEnabled: enabled },
    });

    // Update site toggle UI if it follows global
    if (updated.siteOverrides[currentHostname] === undefined) {
      siteSwitch.checked = enabled;
      siteStatus.textContent = "Follows global";
      siteStatus.classList.toggle("active", enabled);
    }
  });

  // ── Site Toggle ─────────────────────────────────────────

  siteSwitch.addEventListener("change", async () => {
    const enabled = siteSwitch.checked;
    siteStatus.textContent = enabled ? "Enabled" : "Disabled";
    siteStatus.classList.toggle("active", enabled);

    await browser.runtime.sendMessage({
      type: "TOGGLE_SITE",
      hostname: currentHostname,
      enabled: enabled,
    });
  });

  // ── Neovim Toggle ───────────────────────────────────────

  vimSwitch.addEventListener("change", async () => {
    const enabled = vimSwitch.checked;
    vimStatus.textContent = enabled ? "On" : "Off";
    vimStatus.classList.toggle("active", enabled);

    try {
      const data = await browser.storage.local.get("nightfallKeybinds");
      let config =
        data && data.nightfallKeybinds
          ? data.nightfallKeybinds
          : {
              modesEnabled: true,
              keybindings: {
                scrollDown: "j",
                scrollUp: "k",
                scrollLeft: "h",
                scrollRight: "l",
                pageDown: "dd",
                pageUp: "u",
                scrollTop: "gg",
                scrollBottom: "G",
              },
              enabled: {
                scrollDown: true,
                scrollUp: true,
                scrollLeft: true,
                scrollRight: true,
                pageDown: true,
                pageUp: true,
                scrollTop: true,
                scrollBottom: true,
              },
            };

      config.modesEnabled = enabled;
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
    } catch (e) {
      console.error("Error saving vim settings:", e);
    }
  });

  // ── Element Picker ──────────────────────────────────────

  pickerBtn.addEventListener("click", async () => {
    pickerActive = !pickerActive;

    if (pickerActive) {
      pickerBtn.classList.add("active");
      pickerBtnText.textContent = "Stop Picking";
    } else {
      pickerBtn.classList.remove("active");
      pickerBtnText.textContent = "Start Picking";
    }

    await browser.runtime.sendMessage({
      type: "TOGGLE_SELECTOR_MODE",
      enabled: pickerActive,
    });

    // Close the popup so the user can interact with the page
    if (pickerActive) {
      setTimeout(() => window.close(), 300);
    }
  });

  // ── Rules Management ───────────────────────────────────

  async function loadRules() {
    try {
      const rules = await browser.runtime.sendMessage({
        type: "GET_ELEMENT_RULES",
        hostname: currentHostname,
      });

      if (rules && rules.length > 0) {
        rulesContainer.style.display = "block";
        renderRules(rules);
      } else {
        rulesContainer.style.display = "none";
      }
    } catch (e) {
      console.error("Failed to load rules:", e);
    }
  }

  function renderRules(rules) {
    rulesList.innerHTML = "";

    rules.forEach((rule, index) => {
      const li = document.createElement("li");
      li.className = "nf-rule-item";

      li.innerHTML = `
        <span class="nf-rule-selector" title="${escapeHtml(rule.selector)}">${escapeHtml(rule.selector)}</span>
        <span class="nf-rule-mode ${rule.mode}">${rule.mode}</span>
        <button class="nf-rule-delete" data-index="${index}" title="Remove rule">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      `;

      li.querySelector(".nf-rule-delete").addEventListener(
        "click",
        async () => {
          rules.splice(index, 1);
          await browser.runtime.sendMessage({
            type: "SAVE_ELEMENT_RULES",
            hostname: currentHostname,
            selectors: rules,
          });

          if (rules.length === 0) {
            rulesContainer.style.display = "none";
          } else {
            renderRules(rules);
          }

          // Notify content script to refresh
          const tabs = await browser.tabs.query({
            active: true,
            currentWindow: true,
          });
          for (const tab of tabs) {
            try {
              await browser.tabs.sendMessage(tab.id, {
                type: "APPLY_DARK_MODE",
              });
            } catch (e) {}
          }
        },
      );

      rulesList.appendChild(li);
    });
  }

  clearRulesBtn.addEventListener("click", async () => {
    await browser.runtime.sendMessage({
      type: "SAVE_ELEMENT_RULES",
      hostname: currentHostname,
      selectors: [],
    });

    rulesContainer.style.display = "none";
    rulesList.innerHTML = "";

    // Notify content script to refresh
    const tabs = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });
    for (const tab of tabs) {
      try {
        await browser.tabs.sendMessage(tab.id, { type: "APPLY_DARK_MODE" });
      } catch (e) {}
    }
  });

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // ── Clipboard Management ────────────────────────────────

  let clipboardItems = [];

  async function loadClipboard() {
    try {
      const data = await browser.storage.local.get("nightfallClipboard");
      clipboardItems = data.nightfallClipboard || [];
      renderClipboard();
    } catch (e) {
      console.error("Failed to load clipboard:", e);
    }
  }

  async function saveClipboard() {
    try {
      await browser.storage.local.set({ nightfallClipboard: clipboardItems });
      renderClipboard();
    } catch (e) {
      console.error("Failed to save clipboard:", e);
    }
  }

  function renderClipboard() {
    if (!clipboardList) return;
    clipboardList.innerHTML = "";

    if (clipboardItems.length === 0) {
      clipboardList.innerHTML =
        '<p style="text-align:center; color:#555; font-size:11px; padding:10px;">No saved items.</p>';
      return;
    }

    clipboardItems.forEach((item, index) => {
      const div = document.createElement("div");
      div.className = "nf-clipboard-item";

      let contentHtml = "";
      if (item.type === "image") {
        contentHtml = `<img src="${escapeHtml(item.data)}" class="nf-cb-image" alt="Saved clipboard image" />`;
      } else {
        contentHtml = `<div class="nf-cb-text">${escapeHtml(item.data)}</div>`;
      }

      const dateStr = new Date(item.timestamp).toLocaleString();

      div.innerHTML = `
        ${contentHtml}
        <div class="nf-cb-meta">
          <span class="nf-cb-time">${dateStr}</span>
          <div class="nf-cb-actions">
            <button class="nf-cb-btn copy" data-index="${index}" title="Copy to clipboard">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
            </button>
            <button class="nf-cb-btn delete" data-index="${index}" title="Delete item">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        </div>
      `;

      // Copy action
      div.querySelector(".copy").addEventListener("click", async () => {
        try {
          if (item.type === "text") {
            await navigator.clipboard.writeText(item.data);
          } else if (item.type === "image") {
            try {
              const res = await fetch(item.data);
              const blob = await res.blob();
              await navigator.clipboard.write([
                new ClipboardItem({ [blob.type]: blob }),
              ]);
            } catch (err) {
              console.error("Failed to copy image", err);
            }
          }
          const icon = div.querySelector(".copy");
          icon.style.color = "#10b981"; // green for success
          setTimeout(() => {
            icon.style.color = "";
          }, 1000);
        } catch (e) {
          console.error("Copy failed", e);
        }
      });

      // Delete action
      div.querySelector(".delete").addEventListener("click", () => {
        clipboardItems.splice(index, 1);
        saveClipboard();
      });

      clipboardList.appendChild(div);
    });
  }

  if (clearClipboardBtn) {
    clearClipboardBtn.addEventListener("click", () => {
      clipboardItems = [];
      saveClipboard();
    });
  }

  // Listen for paste anywhere in the popup
  document.addEventListener("paste", (e) => {
    const items = e.clipboardData.items;

    for (let i = 0; i < items.length; i++) {
      const clipboardItem = items[i];
      if (clipboardItem.type.indexOf("image") !== -1) {
        const file = clipboardItem.getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onload = function (event) {
            clipboardItems.unshift({
              type: "image",
              data: event.target.result,
              timestamp: Date.now(),
            });
            saveClipboard();
          };
          reader.readAsDataURL(file);
          break; // Stop after first handled item
        }
      } else if (clipboardItem.type === "text/plain") {
        clipboardItem.getAsString(function (text) {
          if (text) {
            clipboardItems.unshift({
              type: "text",
              data: text,
              timestamp: Date.now(),
            });
            saveClipboard();
          }
        });
        break; // Stop after first handled item
      }
    }
  });

  // ── Listen for selector mode changes from content script ─

  browser.runtime.onMessage.addListener((message) => {
    if (message.type === "SELECTOR_MODE_CHANGED") {
      pickerActive = message.enabled;
      if (!pickerActive) {
        pickerBtn.classList.remove("active");
        pickerBtnText.textContent = "Start Picking Elements";
        loadRules(); // Refresh rules
      }
    }
    if (message.type === "CLIPBOARD_UPDATED") {
      loadClipboard();
    }
  });

  // Also listen for raw storage changes (more reliable fallback)
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.nightfallClipboard) {
      clipboardItems = changes.nightfallClipboard.newValue || [];
      renderClipboard();
    }
  });

  // ── Start ───────────────────────────────────────────────

  init();
})();
