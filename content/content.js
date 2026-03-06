// ============================================================
// Nightfall – Neovim Modal Content Script
// Intercepts key events and performs actions based on the current mode
// ============================================================

(async function () {
  "use strict";

  // Wait for modules to load. In MV3, scripts are executed sequentially,
  // but let's be safe.
  if (
    !window.NightfallStorage ||
    !window.NightfallModes ||
    !window.NightfallKeymap
  ) {
    console.warn("Nightfall: Neovim modules failed to load.");
    return;
  }

  const Storage = window.NightfallStorage;
  const Modes = window.NightfallModes;
  const Keymap = window.NightfallKeymap;

  // Initialize
  await Modes.init();

  // ── Auto-switching Logic ─────────────────────────────────────────

  // Enter Insert Mode when focusing an input field
  document.addEventListener("focusin", (e) => {
    if (Modes.getMode() === Modes.MODES.NORMAL && Modes.isEditable(e.target)) {
      Modes.setMode(Modes.MODES.INSERT);
    }
  });

  // Re-enter Normal Mode when blurring an input field (only if clicking away)
  document.addEventListener("focusout", (e) => {
    // If we blur entirely (activeElement becomes body), and we were in INSERT mode, stay?
    // Actually, focusout means they left the field. Let's return to NORMAL mode.
    if (Modes.getMode() === Modes.MODES.INSERT && Modes.isEditable(e.target)) {
      Modes.setMode(Modes.MODES.NORMAL);
      Keymap.clearBuffer();
    }
  });

  // Clean up any stray focus issues if user clicks away
  document.addEventListener("mousedown", (e) => {
    if (!Modes.isEditable(e.target)) {
      if (document.activeElement && document.activeElement !== document.body) {
        document.activeElement.blur();
      }
      Modes.setMode(Modes.MODES.NORMAL);
      Keymap.clearBuffer();
    }
  });

  // ── Keyboard Actions ───────────────────────────────────────────

  function getScrollAmounts() {
    const vh = window.innerHeight;
    const scrollStepX = 50;
    const scrollStepY = 50;
    const pageStepY = vh * 0.8; // similar to pgup/pgdn
    return { scrollStepX, scrollStepY, pageStepY };
  }

  const commands = {
    scrollDown: () => {
      const { scrollStepY } = getScrollAmounts();
      window.scrollBy({ top: scrollStepY, left: 0, behavior: "smooth" });
    },
    scrollUp: () => {
      const { scrollStepY } = getScrollAmounts();
      window.scrollBy({ top: -scrollStepY, left: 0, behavior: "smooth" });
    },
    scrollLeft: () => {
      const { scrollStepX } = getScrollAmounts();
      window.scrollBy({ top: 0, left: -scrollStepX, behavior: "smooth" });
    },
    scrollRight: () => {
      const { scrollStepX } = getScrollAmounts();
      window.scrollBy({ top: 0, left: scrollStepX, behavior: "smooth" });
    },
    pageDown: () => {
      const { pageStepY } = getScrollAmounts();
      window.scrollBy({ top: pageStepY, left: 0, behavior: "smooth" });
    },
    pageUp: () => {
      const { pageStepY } = getScrollAmounts();
      window.scrollBy({ top: -pageStepY, left: 0, behavior: "smooth" });
    },
    scrollTop: () => {
      window.scrollTo({ top: 0, left: window.scrollX, behavior: "smooth" });
    },
    scrollBottom: () => {
      window.scrollTo({
        top:
          document.body.scrollHeight || document.documentElement.scrollHeight,
        left: window.scrollX,
        behavior: "smooth",
      });
    },
    moveLeft: (el) => moveCaret(el, "left"),
    moveRight: (el) => moveCaret(el, "right"),
    moveUp: (el) => moveCaret(el, "up"),
    moveDown: (el) => moveCaret(el, "down"),
    moveLineStart: (el) => moveCaret(el, "lineStart"),
    moveLineEnd: (el) => moveCaret(el, "lineEnd"),
    deleteChar: (el) => deleteChar(el),
    deleteLine: (el) => {
      if (!el || !Modes.isEditable(el)) return;
      if (el.isContentEditable) {
        document.execCommand("delete");
        return;
      }
      try {
        const start = el.selectionStart;
        const text = el.value;
        const prevLF = text.lastIndexOf("\n", start - 1);
        const nextLF = text.indexOf("\n", start);
        const lineStart = prevLF === -1 ? 0 : prevLF + 1;
        const lineEnd = nextLF === -1 ? text.length : nextLF + 1;
        el.value = text.substring(0, lineStart) + text.substring(lineEnd);
        el.setSelectionRange(lineStart, lineStart);
        el.dispatchEvent(new Event("input", { bubbles: true }));
      } catch (e) {}
    },
    undo: () => document.execCommand("undo"),
    redo: () => document.execCommand("redo"),
    enterInsert: (el) => Modes.setMode(Modes.MODES.INSERT),
    enterInsertEnd: (el) => {
      moveCaret(el, "lineStart");
      Modes.setMode(Modes.MODES.INSERT);
    },
    enterAppend: (el) => {
      moveCaret(el, "right");
      Modes.setMode(Modes.MODES.INSERT);
    },
    enterAppendEnd: (el) => {
      moveCaret(el, "lineEnd");
      Modes.setMode(Modes.MODES.INSERT);
    },
  };

  function moveCaret(el, direction) {
    if (el.isContentEditable) {
      const sel = window.getSelection();
      let moveDir =
        direction === "left" ||
        direction === "up" ||
        direction === "start" ||
        direction === "lineStart"
          ? "backward"
          : "forward";
      let moveGran =
        direction === "left" || direction === "right"
          ? "character"
          : direction === "up" || direction === "down"
            ? "line"
            : direction === "start" || direction === "end"
              ? "documentboundary"
              : "lineboundary";
      sel.modify("move", moveDir, moveGran);
      return;
    }

    try {
      let start = el.selectionStart;
      if (direction === "left") start = Math.max(0, start - 1);
      else if (direction === "right")
        start = Math.min(el.value.length, start + 1);
      else if (direction === "start") start = 0;
      else if (direction === "end") start = el.value.length;
      else if (direction === "lineStart") {
        const lines = el.value.substring(0, start).split("\n");
        start = start - lines[lines.length - 1].length;
      } else if (direction === "lineEnd") {
        const nextLF = el.value.indexOf("\n", start);
        start = nextLF === -1 ? el.value.length : nextLF;
      }
      // up and down for input/textarea fallback
      else if (direction === "up") {
        const lines = el.value.substring(0, start).split("\n");
        if (lines.length > 1) {
          const prevLineLen = el.value
            .substring(0, start - lines[lines.length - 1].length - 1)
            .split("\n")
            .pop().length;
          start =
            start -
            lines[lines.length - 1].length -
            1 -
            Math.max(0, prevLineLen - lines[lines.length - 1].length);
        } else {
          start = 0;
        }
      }
      el.setSelectionRange(start, start);
    } catch (e) {}
  }

  function deleteChar(el) {
    if (el.isContentEditable) {
      document.execCommand("delete");
      return;
    }
    try {
      let start = el.selectionStart;
      if (start < el.value.length) {
        el.value = el.value.substring(0, start) + el.value.substring(start + 1);
        el.setSelectionRange(start, start);
        // trigger input event
        el.dispatchEvent(new Event("input", { bubbles: true }));
      }
    } catch (e) {}
  }

  // ── Main Event Listener ────────────────────────────────────────

  document.addEventListener(
    "keydown",
    (e) => {
      // We ignore events natively handled by modifiers, so user can do Cmd+C etc.
      // (Unless it's a specific mapped chord we might support later, but for now stick to simple)
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      let mode = Modes.getMode();

      // Escape handling (Universal exit for Modes/Visual/Selector)
      if (e.key === "Escape") {
        if (mode === Modes.MODES.INSERT || mode === Modes.MODES.VISUAL) {
          if (mode === Modes.MODES.VISUAL)
            window.getSelection().removeAllRanges();
          Modes.setMode(Modes.MODES.NORMAL);
          e.preventDefault();
          e.stopPropagation();
          return;
        }
      }

      if (mode === Modes.MODES.NORMAL) {
        const config = Modes.config;

        if (config && config.modesEnabled) {
          const action = Keymap.getAction(e.key, config);

          if (action === "PENDING") {
            e.preventDefault();
            e.stopPropagation();
            return;
          }

          if (action && commands[action]) {
            commands[action](e.target);
            e.preventDefault();
            e.stopPropagation();
            return;
          }
        }

        // Global Mode Switching shortcuts (fallback if not mapped)
        if (e.key === "i" && !Modes.isEditable(e.target)) {
          Modes.setMode(Modes.MODES.INSERT);
          e.preventDefault();
          return;
        }

        // Block regular typing inside text field in normal mode
        if (Modes.isEditable(e.target) && e.key.length === 1) {
          e.preventDefault();
          e.stopPropagation();
        }
      }
    },
    true,
  );

  // ── Auto Clipboard Capture ─────────────────────────────────────

  let lastRightClickTarget = null;
  document.addEventListener(
    "contextmenu",
    (e) => {
      lastRightClickTarget = e.target;
    },
    true,
  );

  async function addClipboardItem(item) {
    const data = await browser.storage.local.get("nightfallClipboard");
    let clipboardItems = data.nightfallClipboard || [];

    // Deduplicate
    if (
      clipboardItems.length > 0 &&
      clipboardItems[0].data === item.data &&
      clipboardItems[0].type === item.type
    ) {
      return;
    }

    clipboardItems.unshift({
      ...item,
      timestamp: Date.now(),
    });

    if (clipboardItems.length > 50) {
      clipboardItems = clipboardItems.slice(0, 50);
    }

    await browser.storage.local.set({ nightfallClipboard: clipboardItems });
  }

  async function captureImage(src) {
    if (!src) return;
    try {
      // Send to background script as backgrounds have no CORS restrictions
      await browser.runtime.sendMessage({
        type: "CAPTURE_IMAGE",
        src: src,
      });
    } catch (err) {
      console.error("Nightfall: Failed to capture image via background", err);
    }
  }

  document.addEventListener(
    "copy",
    async (e) => {
      if (document.visibilityState !== "visible") return;

      // 1. Check for text selection
      const selection = window.getSelection().toString().trim();
      if (selection) {
        await addClipboardItem({ type: "text", data: selection });
        return;
      }

      // 2. Check e.clipboardData immediately (if browser populated it)
      if (e.clipboardData && e.clipboardData.items) {
        for (const item of e.clipboardData.items) {
          if (item.type.startsWith("image/")) {
            const blob = item.getAsFile();
            const reader = new FileReader();
            reader.onload = () => {
              addClipboardItem({ type: "image", data: reader.result });
            };
            reader.readAsDataURL(blob);
            return;
          }
        }
      }

      // 3. Fallback: Check target or last right-click target
      const target = e.target || lastRightClickTarget;
      if (target && (target.tagName === "IMG" || target.closest("img"))) {
        const img = target.tagName === "IMG" ? target : target.closest("img");
        await captureImage(img.src);
      }
    },
    true,
  );
})();
