// ============================================================
// Nightfall – Content Script (Dark Mode Engine)
// Handles dark mode application, element selector, and rules
// ============================================================

(function () {
  'use strict';

  const HOSTNAME = window.location.hostname;
  let selectorMode = false;
  let hoveredElement = null;
  let tooltipElement = null;

  // ── Apply / Remove Dark Mode ──────────────────────────────

  function applyDarkMode() {
    document.documentElement.classList.add('nightfall-active');
    loadAndApplyElementRules();
  }

  function removeDarkMode() {
    document.documentElement.classList.remove('nightfall-active');
    // Clean up custom element classes
    document.querySelectorAll('.nightfall-force-dark, .nightfall-force-light').forEach(el => {
      el.classList.remove('nightfall-force-dark', 'nightfall-force-light');
    });
  }

  // ── Element Rules (per-site custom dark elements) ─────────

  async function loadAndApplyElementRules() {
    try {
      const rules = await browser.runtime.sendMessage({
        type: 'GET_ELEMENT_RULES',
        hostname: HOSTNAME
      });

      if (rules && rules.length > 0) {
        rules.forEach(rule => {
          try {
            const elements = document.querySelectorAll(rule.selector);
            elements.forEach(el => {
              if (rule.mode === 'dark') {
                el.classList.add('nightfall-force-dark');
                el.classList.remove('nightfall-force-light');
              } else if (rule.mode === 'light') {
                el.classList.add('nightfall-force-light');
                el.classList.remove('nightfall-force-dark');
              }
            });
          } catch (e) {
            // Invalid selector, skip
          }
        });
      }
    } catch (e) {
      // Extension context might be invalidated
    }
  }

  // ── Generate a unique CSS selector for an element ─────────

  function generateSelector(element) {
    if (element.id) {
      return `#${CSS.escape(element.id)}`;
    }

    const path = [];
    let current = element;

    while (current && current !== document.body && current !== document.documentElement) {
      let selector = current.tagName.toLowerCase();

      if (current.id) {
        selector = `#${CSS.escape(current.id)}`;
        path.unshift(selector);
        break;
      }

      if (current.className && typeof current.className === 'string') {
        const classes = current.className
          .split(/\s+/)
          .filter(c => c && !c.startsWith('nightfall-'))
          .slice(0, 2);
        if (classes.length > 0) {
          selector += '.' + classes.map(c => CSS.escape(c)).join('.');
        }
      }

      // Add nth-child for uniqueness
      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(
          s => s.tagName === current.tagName
        );
        if (siblings.length > 1) {
          const index = siblings.indexOf(current) + 1;
          selector += `:nth-of-type(${index})`;
        }
      }

      path.unshift(selector);
      current = current.parentElement;
    }

    return path.join(' > ');
  }

  // ── Selector Mode (Element Picker) ────────────────────────

  function enableSelectorMode() {
    selectorMode = true;
    document.body.classList.add('nightfall-selector-active');
    document.addEventListener('mouseover', onSelectorHover, true);
    document.addEventListener('mouseout', onSelectorUnhover, true);
    document.addEventListener('click', onSelectorClick, true);
    document.addEventListener('keydown', onSelectorKeydown, true);
    showSelectorTooltip();
  }

  function disableSelectorMode() {
    selectorMode = false;
    document.body.classList.remove('nightfall-selector-active');
    document.removeEventListener('mouseover', onSelectorHover, true);
    document.removeEventListener('mouseout', onSelectorUnhover, true);
    document.removeEventListener('click', onSelectorClick, true);
    document.removeEventListener('keydown', onSelectorKeydown, true);

    if (hoveredElement) {
      hoveredElement.classList.remove('nightfall-selector-hover');
      hoveredElement.removeAttribute('data-nightfall-tag');
      hoveredElement = null;
    }
    removeSelectorTooltip();
  }

  function onSelectorHover(e) {
    if (!selectorMode) return;
    e.stopPropagation();

    // Don't highlight the tooltip itself
    if (e.target.closest('.nightfall-selector-tooltip')) return;

    if (hoveredElement) {
      hoveredElement.classList.remove('nightfall-selector-hover');
      hoveredElement.removeAttribute('data-nightfall-tag');
    }

    hoveredElement = e.target;
    let tag = e.target.tagName.toLowerCase();
    if (e.target.className && typeof e.target.className === 'string') {
      const cls = e.target.className.split(/\s+/).filter(c => !c.startsWith('nightfall-')).slice(0, 2).join('.');
      if (cls) tag += '.' + cls;
    }
    hoveredElement.setAttribute('data-nightfall-tag', tag);
    hoveredElement.classList.add('nightfall-selector-hover');
  }

  function onSelectorUnhover(e) {
    if (!selectorMode) return;
    if (hoveredElement && e.target === hoveredElement) {
      hoveredElement.classList.remove('nightfall-selector-hover');
      hoveredElement.removeAttribute('data-nightfall-tag');
      hoveredElement = null;
    }
  }

  async function onSelectorClick(e) {
    if (!selectorMode) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    // Don't process clicks on the tooltip
    if (e.target.closest('.nightfall-selector-tooltip')) return;

    const element = e.target;
    const selector = generateSelector(element);

    // Determine action: if element already has force-dark, toggle to force-light, etc.
    let mode = 'dark';
    if (element.classList.contains('nightfall-force-dark')) {
      mode = 'light';
      element.classList.remove('nightfall-force-dark');
      element.classList.add('nightfall-force-light');
    } else if (element.classList.contains('nightfall-force-light')) {
      // Remove all custom rules
      mode = 'remove';
      element.classList.remove('nightfall-force-light');
    } else {
      element.classList.add('nightfall-force-dark');
    }

    // Save the rule
    try {
      const existingRules = await browser.runtime.sendMessage({
        type: 'GET_ELEMENT_RULES',
        hostname: HOSTNAME
      });

      let rules = existingRules || [];

      // Remove any existing rule for this selector
      rules = rules.filter(r => r.selector !== selector);

      if (mode !== 'remove') {
        rules.push({ selector, mode });
      }

      await browser.runtime.sendMessage({
        type: 'SAVE_ELEMENT_RULES',
        hostname: HOSTNAME,
        selectors: rules
      });
    } catch (e) {
      // Extension context invalidated
    }
  }

  function onSelectorKeydown(e) {
    if (e.key === 'Escape') {
      disableSelectorMode();
      // Notify popup
      try {
        browser.runtime.sendMessage({ type: 'SELECTOR_MODE_CHANGED', enabled: false });
      } catch (err) { }
    }
  }

  function showSelectorTooltip() {
    removeSelectorTooltip();

    tooltipElement = document.createElement('div');
    tooltipElement.className = 'nightfall-selector-tooltip';
    tooltipElement.innerHTML = `
      <span>🎯 <strong>Element Picker</strong> — Click elements to toggle dark. <kbd>Esc</kbd> to exit.</span>
      <button class="nightfall-tooltip-close">Done</button>
    `;
    tooltipElement.querySelector('.nightfall-tooltip-close').addEventListener('click', (e) => {
      e.stopPropagation();
      disableSelectorMode();
      try {
        browser.runtime.sendMessage({ type: 'SELECTOR_MODE_CHANGED', enabled: false });
      } catch (err) { }
    });

    document.body.appendChild(tooltipElement);
  }

  function removeSelectorTooltip() {
    if (tooltipElement) {
      tooltipElement.remove();
      tooltipElement = null;
    }
  }

  // ── Message Listener ──────────────────────────────────────

  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'SETTINGS_CHANGED') {
      const settings = message.settings;
      const siteEnabled = settings.siteOverrides[HOSTNAME] !== undefined
        ? settings.siteOverrides[HOSTNAME]
        : settings.globalEnabled;

      if (siteEnabled) {
        applyDarkMode();
      } else {
        removeDarkMode();
      }
    }

    if (message.type === 'SELECTOR_MODE') {
      if (message.enabled) {
        enableSelectorMode();
      } else {
        disableSelectorMode();
      }
    }

    if (message.type === 'APPLY_DARK_MODE') {
      applyDarkMode();
    }

    if (message.type === 'REMOVE_DARK_MODE') {
      removeDarkMode();
    }

    if (message.type === 'PING') {
      sendResponse({ status: 'alive' });
    }
  });

  // ── Initialize ────────────────────────────────────────────

  async function init() {
    try {
      const settings = await browser.runtime.sendMessage({ type: 'GET_SETTINGS' });
      if (!settings) return;

      const siteEnabled = settings.siteOverrides[HOSTNAME] !== undefined
        ? settings.siteOverrides[HOSTNAME]
        : settings.globalEnabled;

      if (siteEnabled) {
        applyDarkMode();
      }
    } catch (e) {
      // Extension context might not be ready yet
    }
  }

  // Run init when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
