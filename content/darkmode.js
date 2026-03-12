// ============================================================
// Nightfall – Content Script (Dark Mode Engine + Element Picker)
// ============================================================

(function () {
  'use strict';

  const HOSTNAME = window.location.hostname;
  let selectorMode = false;
  let hoveredEl    = null;   // element currently under the cursor in picker mode
  let toolbar      = null;   // floating toolbar DOM node
  let observer     = null;
  let cachedRules  = [];     // [{selector, mode}]  mode = 'light' | 'dark'

  // ── Helpers ────────────────────────────────────────────────

  function isDynamic(str) {
    if (!str || typeof str !== 'string') return true;
    if (/\d{5,}/.test(str))              return true;
    if (str.length > 20 && (str.match(/\d/g) || []).length > 5) return true;
    return false;
  }

  // Generate a stable CSS selector for any element
  function generateSelector(element) {
    if (element.id && !isDynamic(element.id)) {
      return '#' + CSS.escape(element.id);
    }

    const path = [];
    let cur = element;

    while (cur && cur.nodeType === Node.ELEMENT_NODE
           && cur !== document.body && cur !== document.documentElement) {

      let seg = cur.tagName.toLowerCase();

      if (cur.id && !isDynamic(cur.id)) {
        seg = '#' + CSS.escape(cur.id);
        path.unshift(seg);
        break;
      }

      if (cur.className && typeof cur.className === 'string') {
        const classes = cur.className
          .split(/\s+/)
          .filter(c => c && !c.startsWith('nf-') && !c.startsWith('nightfall-') && !isDynamic(c))
          .slice(0, 2);
        if (classes.length) seg += '.' + classes.map(c => CSS.escape(c)).join('.');
      }

      // Add nth-of-type for disambiguation
      const parent = cur.parentElement;
      if (parent) {
        const sameTag = Array.from(parent.children).filter(s => s.tagName === cur.tagName);
        if (sameTag.length > 1) {
          seg += ':nth-of-type(' + (sameTag.indexOf(cur) + 1) + ')';
        }
      }

      path.unshift(seg);
      cur = cur.parentElement;
    }

    return path.join(' > ');
  }

  // ── Apply / Remove Dark Mode ────────────────────────────────

  function applyDarkMode() {
    document.documentElement.classList.add('nightfall-active');
    loadAndApplyRules();
    startObserver();
  }

  function removeDarkMode() {
    document.documentElement.classList.remove('nightfall-active');
    stopObserver();
    document.querySelectorAll('.nf-el-light, .nf-el-dark').forEach(el => {
      el.classList.remove('nf-el-light', 'nf-el-dark');
    });
  }

  // ── Element Rules ───────────────────────────────────────────

  async function loadAndApplyRules() {
    try {
      const response = await browser.runtime.sendMessage({
        type: 'GET_ELEMENT_RULES',
        hostname: HOSTNAME
      });
      // Migrate old class names if any
      cachedRules = (response || []).map(r => ({
        selector: r.selector,
        mode: r.mode === 'nightfall-force-light' ? 'light'
             : r.mode === 'nightfall-force-dark'  ? 'dark'
             : r.mode
      }));
      applyRulesToDOM(document);
    } catch (e) {
      console.warn('Nightfall: could not load element rules.', e);
    }
  }

  function applyRulesToDOM(root) {
    // Clear existing overrides first
    root.querySelectorAll('.nf-el-light, .nf-el-dark').forEach(el => {
      el.classList.remove('nf-el-light', 'nf-el-dark');
    });

    if (!cachedRules.length) return;

    cachedRules.forEach(rule => {
      try {
        root.querySelectorAll(rule.selector).forEach(el => {
          el.classList.add(rule.mode === 'light' ? 'nf-el-light' : 'nf-el-dark');
        });
      } catch (_) { /* invalid selector — skip */ }
    });
  }

  async function saveRules() {
    try {
      await browser.runtime.sendMessage({
        type: 'SAVE_ELEMENT_RULES',
        hostname: HOSTNAME,
        selectors: cachedRules
      });
    } catch (_) { /* extension context gone */ }
  }

  // ── MutationObserver (re-apply rules on new nodes) ─────────

  function startObserver() {
    if (observer) return;
    observer = new MutationObserver(mutations => {
      if (mutations.some(m => m.addedNodes.length > 0)) {
        applyRulesToDOM(document);
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  function stopObserver() {
    if (observer) { observer.disconnect(); observer = null; }
  }

  // ══════════════════════════════════════════════════════════════
  // ELEMENT PICKER
  // ══════════════════════════════════════════════════════════════

  // Cycle:  undefined → 'light' → 'dark' → undefined (rule removed)
  function nextMode(current) {
    if (!current)          return 'light';
    if (current === 'light') return 'dark';
    return null; // remove rule
  }

  function currentRuleFor(selector) {
    const found = cachedRules.find(r => r.selector === selector);
    return found ? found.mode : null;  // null = no rule
  }

  // Get human-readable label for the upcoming action
  function actionLabel(nextM) {
    if (nextM === 'light')  return 'click → make Light';
    if (nextM === 'dark')   return 'click → make Dark';
    return 'click → reset';
  }

  // Apply the hover outline + preview to hovered element
  function applyHoverPreview(el) {
    const sel      = generateSelector(el);
    const curMode  = currentRuleFor(sel);
    const nxt      = nextMode(curMode);

    // Tag label (element identifier)
    let tag = el.tagName.toLowerCase();
    if (el.id && !isDynamic(el.id)) tag += '#' + el.id;
    else if (el.className && typeof el.className === 'string') {
      const cls = el.className.split(/\s+/).filter(c => !c.startsWith('nf-') && !c.startsWith('nightfall-')).slice(0, 2).join('.');
      if (cls) tag += '.' + cls;
    }

    el.setAttribute('data-nf-tag',    tag);
    el.setAttribute('data-nf-action', actionLabel(nxt));
    el.classList.add('nf-picker-hover');

    // Preview: temporarily show what clicking will do
    if (nxt === 'light') {
      el.classList.add('nf-preview-light');
    } else if (nxt === 'dark') {
      el.classList.add('nf-preview-dark');
    }
    // nxt === null → no extra class; element already looks like its "reset" state
  }

  // Remove hover outline + preview from element
  function clearHoverPreview(el) {
    if (!el) return;
    el.classList.remove('nf-picker-hover', 'nf-preview-light', 'nf-preview-dark');
    el.removeAttribute('data-nf-tag');
    el.removeAttribute('data-nf-action');
  }

  // ── Picker Event Handlers ───────────────────────────────────

  function onHover(e) {
    if (!selectorMode) return;
    const target = e.target;

    // Ignore our own toolbar
    if (target.closest && target.closest('.nf-selector-bar')) return;

    if (hoveredEl !== target) {
      clearHoverPreview(hoveredEl);
      hoveredEl = target;
      applyHoverPreview(hoveredEl);
    }
  }

  function onUnhover(e) {
    if (!selectorMode) return;
    if (e.target.closest && e.target.closest('.nf-selector-bar')) return;

    if (e.target === hoveredEl) {
      clearHoverPreview(hoveredEl);
      hoveredEl = null;
    }
  }

  function onClick(e) {
    if (!selectorMode) return;
    if (e.target.closest && e.target.closest('.nf-selector-bar')) return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    const el  = e.target;
    const sel = generateSelector(el);
    const cur = currentRuleFor(sel);
    const nxt = nextMode(cur);

    // Remove any existing rule for this selector
    cachedRules = cachedRules.filter(r => r.selector !== sel);

    // Remove current override classes from all matching elements
    document.querySelectorAll(sel).forEach(node => {
      node.classList.remove('nf-el-light', 'nf-el-dark', 'nf-preview-light', 'nf-preview-dark', 'nf-picker-hover');
      node.removeAttribute('data-nf-tag');
      node.removeAttribute('data-nf-action');
    });

    if (nxt !== null) {
      // Add new rule
      cachedRules.push({ selector: sel, mode: nxt });

      // Apply immediately so the change is visible
      document.querySelectorAll(sel).forEach(node => {
        node.classList.add(nxt === 'light' ? 'nf-el-light' : 'nf-el-dark');
      });
    }

    // Save async
    saveRules();

    // Re-apply hover preview on the same element (next state)
    hoveredEl = el;
    applyHoverPreview(el);
  }

  function onKeydown(e) {
    if (!selectorMode) return;
    if (e.key === 'Escape') {
      clearHoverPreview(hoveredEl);
      hoveredEl = null;
      disableSelectorMode();
      try { browser.runtime.sendMessage({ type: 'SELECTOR_MODE_CHANGED', enabled: false }); } catch (_) {}
    }
  }

  // ── Enable / Disable Picker ─────────────────────────────────

  function enableSelectorMode() {
    selectorMode = true;
    document.body.classList.add('nightfall-selector-active');
    document.addEventListener('mouseover',  onHover,   true);
    document.addEventListener('mouseout',   onUnhover, true);
    document.addEventListener('click',      onClick,   true);
    document.addEventListener('keydown',    onKeydown, true);
    showToolbar();
  }

  function disableSelectorMode() {
    selectorMode = false;
    document.body.classList.remove('nightfall-selector-active');
    document.removeEventListener('mouseover',  onHover,   true);
    document.removeEventListener('mouseout',   onUnhover, true);
    document.removeEventListener('click',      onClick,   true);
    document.removeEventListener('keydown',    onKeydown, true);
    clearHoverPreview(hoveredEl);
    hoveredEl = null;
    removeToolbar();
  }

  // ── Floating Toolbar ────────────────────────────────────────

  function showToolbar() {
    removeToolbar();
    toolbar = document.createElement('div');
    toolbar.className = 'nf-selector-bar';
    toolbar.innerHTML = `
      <span>Element Picker &mdash; hover to preview, click to apply &nbsp; <kbd>Esc</kbd> to exit</span>
      <button class="nf-selector-bar-btn" id="nf-done-btn">Done</button>
    `;
    toolbar.querySelector('#nf-done-btn').addEventListener('click', e => {
      e.stopPropagation();
      clearHoverPreview(hoveredEl);
      hoveredEl = null;
      disableSelectorMode();
      try { browser.runtime.sendMessage({ type: 'SELECTOR_MODE_CHANGED', enabled: false }); } catch (_) {}
    });
    document.body.appendChild(toolbar);
  }

  function removeToolbar() {
    if (toolbar) { toolbar.remove(); toolbar = null; }
  }

  // ── Message Listener ────────────────────────────────────────

  browser.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    switch (msg.type) {
      case 'SETTINGS_CHANGED': {
        const s = msg.settings;
        if (!s) return;
        const on = s.siteOverrides[HOSTNAME] !== undefined
          ? s.siteOverrides[HOSTNAME]
          : s.globalEnabled;
        on ? applyDarkMode() : removeDarkMode();
        break;
      }
      case 'SELECTOR_MODE':
        msg.enabled ? enableSelectorMode() : disableSelectorMode();
        break;
      case 'APPLY_DARK_MODE':
        loadAndApplyRules();
        break;
      case 'REMOVE_DARK_MODE':
        removeDarkMode();
        break;
      case 'HARD_RESET':
        cachedRules = [];
        removeDarkMode();
        location.reload();
        break;
      case 'PING':
        sendResponse({ status: 'alive' });
        break;
    }
  });

  // Keep rules in sync when popup clears them
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.nightfallElementRules) {
      const all = changes.nightfallElementRules.newValue || {};
      cachedRules = (all[HOSTNAME] || []).map(r => ({
        selector: r.selector,
        mode: r.mode
      }));
      applyRulesToDOM(document);
    }
  });

  // ── Init ────────────────────────────────────────────────────

  async function init() {
    try {
      const settings = await browser.runtime.sendMessage({ type: 'GET_SETTINGS' });
      if (!settings) return;
      const on = settings.siteOverrides[HOSTNAME] !== undefined
        ? settings.siteOverrides[HOSTNAME]
        : settings.globalEnabled;
      if (on) applyDarkMode();
    } catch (_) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
