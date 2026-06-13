/**
 * Side Cart Tabs controller
 * - Keeps ARIA in sync for tablist/tabpanel
 * - Keyboard navigation (ArrowLeft/Right, Home/End)
 * - Persists active tab in sessionStorage
 * - Re-initializes after renders and when the drawer opens
 *
 * This complements [CartUIController.sideCartTabs()](assets/cart-ui.js:230) which handles the visual show/hide via data attributes.
 */

const STORAGE_KEY = "qf_sidecart_tab";

function getDrawerRoot(doc = document) {
  // Drawer content gets re-rendered; scope to the drawer content area if present
  return doc.querySelector("[data-cart-drawer-content]") || doc;
}

function queryTabs(root) {
  const nav = root.querySelector('.side-cart-tabs[role="tablist"]');
  if (!nav) return { nav: null, tabs: [], panels: [] };
  const tabs = Array.from(nav.querySelectorAll('[data-cart-tab][role="tab"]'));
  // Panels live alongside nav; select all panels in the drawer content
  const panels = Array.from(root.querySelectorAll("[data-cart-content]"));
  return { nav, tabs, panels };
}

function getInitialTabId(tabs) {
  // Restore last used if available, else the first tab's data-tab
  const saved = sessionStorage.getItem(STORAGE_KEY);
  if (saved && tabs.some((t) => t.dataset.tab === saved)) return saved;
  return tabs[0]?.dataset.tab || null;
}

function ensurePanelDisplayCache(panel) {
  if (panel.dataset.originalDisplay !== undefined) return;
  const inlineDisplay = panel.style.display;
  if (inlineDisplay && inlineDisplay !== "none") {
    panel.dataset.originalDisplay = inlineDisplay;
  } else {
    const computed = window.getComputedStyle ? window.getComputedStyle(panel).display : "";
    panel.dataset.originalDisplay = computed && computed !== "none" ? computed : "flex";
  }
}

function setPanelVisibility(panel, isVisible) {
  ensurePanelDisplayCache(panel);
  if (isVisible) {
    if (panel.dataset.originalDisplay && panel.dataset.originalDisplay !== "none") {
      panel.style.display = panel.dataset.originalDisplay;
    } else {
      panel.style.removeProperty("display");
    }
    panel.removeAttribute("hidden");
    panel.setAttribute("aria-hidden", "false");
  } else {
    panel.style.display = "none";
    panel.setAttribute("hidden", "");
    panel.setAttribute("aria-hidden", "true");
  }
}

function setAriaActive(tabs, panels, tabId, { focus = false } = {}) {
  tabs.forEach((btn) => {
    const active = btn.dataset.tab === tabId;
    btn.setAttribute("aria-selected", active ? "true" : "false");
    btn.tabIndex = active ? 0 : -1;
    if (active && focus) btn.focus();
    btn.classList.toggle("active", !!active);
  });

  panels.forEach((panel) => {
    const isMatch = panel.classList.contains(tabId) || panel.id === `sidecart-panel-${tabId}`;
    setPanelVisibility(panel, isMatch);
  });
}

function activateTab(root, tabId, { fromKeyboard = false, focus = false } = {}) {
  const { tabs, panels } = queryTabs(root);
  if (!tabs.length) return;

  if (!tabs.some((t) => t.dataset.tab === tabId)) return;

  // Persist for session
  sessionStorage.setItem(STORAGE_KEY, tabId);

  // Update ARIA immediately
  setAriaActive(tabs, panels, tabId, { focus });

  // Ensure visual show/hide occurs via the existing controller.
  // If this is a keyboard-initiated change, dispatch a click on the target tab
  // so [CartUIController.sideCartTabs()](assets/cart-ui.js:230) runs.
  if (fromKeyboard) {
    const btn = tabs.find((t) => t.dataset.tab === tabId);
    if (btn) btn.click();
  }

  // If Wishlist tab is being activated, render wishlist grid (idempotent)
  if (tabId === "wishlist" && typeof window !== "undefined") {
    try {
      if (window.Wishlist && typeof window.Wishlist.renderWishlist === "function") {
        window.Wishlist.renderWishlist();
      }
    } catch (e) {
      // Fail safe — never break cart
      console.warn("Wishlist render failed:", e);
    }
  }
}

function bindEvents(root) {
  const { nav, tabs } = queryTabs(root);
  if (!nav || !tabs.length) return;

  if (nav.dataset.tabsBound === "true") return; // prevent duplicate binding after re-renders
  nav.dataset.tabsBound = "true";

  // Click: update ARIA + persistence; CartUI controller will also receive this click
  nav.addEventListener("click", (e) => {
    const btn = e.target.closest('[data-cart-tab][role="tab"]');
    if (!btn) return;
    const tabId = btn.dataset.tab;
    // Update ARIA immediately; no need to programmatically click (this is already a click)
    const rootScope = getDrawerRoot(document);
    const { tabs, panels } = queryTabs(rootScope);
    setAriaActive(tabs, panels, tabId, { focus: false });
    sessionStorage.setItem(STORAGE_KEY, tabId);

    // Wishlist render on user click
    if (
      tabId === "wishlist" &&
      window.Wishlist &&
      typeof window.Wishlist.renderWishlist === "function"
    ) {
      window.Wishlist.renderWishlist();
    }
  });

  // Keyboard navigation per WAI-ARIA Tabs
  nav.addEventListener("keydown", (e) => {
    const current = document.activeElement;
    if (!current || !current.matches('[data-cart-tab][role="tab"]')) return;

    const order = tabs;
    const idx = order.indexOf(current);
    if (idx === -1) return;

    let nextIndex = idx;
    let handled = true;

    switch (e.key) {
      case "ArrowRight":
      case "Right":
        nextIndex = (idx + 1) % order.length;
        break;
      case "ArrowLeft":
      case "Left":
        nextIndex = (idx - 1 + order.length) % order.length;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = order.length - 1;
        break;
      case "Enter":
      case " ":
      case "Spacebar":
        // Activate the currently focused tab
        activateTab(getDrawerRoot(document), current.dataset.tab, {
          fromKeyboard: true,
          focus: true,
        });
        return; // allow default click semantics handled above
      default:
        handled = false;
    }

    if (handled) {
      e.preventDefault();
      e.stopPropagation();
      const target = order[nextIndex];
      if (target) {
        // Move focus and activate
        target.focus();
        activateTab(getDrawerRoot(document), target.dataset.tab, {
          fromKeyboard: true,
          focus: true,
        });
      }
    }
  });
}

function init() {
  const root = getDrawerRoot(document);
  const { tabs, panels } = queryTabs(root);
  if (!tabs.length) return;

  // Ensure one tab is selected at init
  const initialId = getInitialTabId(tabs);
  if (initialId) {
    setAriaActive(tabs, panels, initialId, { focus: false });
    // If wishlist is initially selected due to sessionStorage, ensure grid render
    if (
      initialId === "wishlist" &&
      window.Wishlist &&
      typeof window.Wishlist.renderWishlist === "function"
    ) {
      window.Wishlist.renderWishlist();
    }
  }

  bindEvents(root);
}

// Bind on relevant lifecycle events
window.addEventListener("side_cart_opened", () => {
  // Re-init upon drawer open
  setTimeout(init, 0);
});

window.addEventListener("cart:sections-rendered", () => {
  // Content has been replaced; re-init bindings and ARIA
  setTimeout(init, 0);
});

// Optional: if the snippet renders tabs at page load (SSR), initialize once
document.addEventListener("DOMContentLoaded", () => {
  setTimeout(init, 0);
});
