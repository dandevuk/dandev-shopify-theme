import { toasty } from '@theme/toasty';

export class CartUIController {
  constructor() {
    this.cart = window.cart;

    this.selectors = {
      openSideCart: '[data-open-cart],[open-side-cart],.openSideCart',
      closeSideCart: '[data-close-cart],[close-side-cart],.closeSideCart',
      quantityIncrease: '[data-quantity-increment],[data-cart-quantity] [data-action="increase"],.quantity-wrapper .plus',
      quantityDecrease: '[data-quantity-decrement],[data-cart-quantity] [data-action="decrease"],.quantity-wrapper .minus',
      removeButton: '[data-cart-remove],[data-remove-item],.remove-item',
      cartTabs: '[data-cart-tab],[side-cart-tab]',
      cartContents: '[data-cart-content],[side-cart-form],[cart-content]',
      discountForm: '[data-cart-discount-form]',
      discountInput: '[data-cart-discount-input],[name="discount"]',
      expressCheckoutTrigger: '[data-express-toggle],#express-checkout-trigger,express-checkout-trigger',
      expressCheckoutSection: '[data-express-section],#express-checkout-section,express-checkout-section',
      additionalCheckoutToggle: '[additional-checkout-toggle]',
      additionalCheckoutContainer: '[additional-checkout-buttons]',
      disableDuringRequestScopes: '[data-cart-drawer],[cart-drawer-container],[data-cart-container],[cart-container]',
      hoverPreload: '[data-cart-hover],[data-open-cart],[open-side-cart],.openSideCart',
    };

    this.state = {
      hoverPreloaded: false,
      expressOutsideHandler: null,
    };

    this.hoverPreloadController = null;
    this.hoverBoundElements = new WeakSet();
    this.loadingLabel = document.body?.dataset?.cartLoadingLabel || 'Updating cart…';
    this.loadingOverlays = new WeakMap();

    // Drag protection state to avoid closing the drawer when interacting with sliders/sliders
    this._drawerDrag = { active: false, pointerId: null, startX: 0, startY: 0, isDragging: false };
    this._lastWasDrag = false;
    this._lastWasDragTimer = null;

    this.init();
  }

  init() {
    this.injectLoadingStyles();
    document.body.addEventListener('click', this.handleClick);
    document.body.addEventListener("keydown", this.handleKeydown);
    document.body.addEventListener('submit', this.handleSubmit);

    this.setupHoverPreload();
    this.bindCartEvents();
    this.rebindDynamicElements();
    this.setupLoadingOverlays();
    // Monitor pointer interactions inside the drawer so we can ignore click events
    // immediately following swipes/drags (common with slider/sliders).
    this.setupDrawerDragProtection();
  }

  handleClick = (event) => {
    this.toggleSideCart(event);
    this.quantityButtons(event);
    this.removeCartItem(event);
    this.sideCartTabs(event);
    this.toggleAdditionalCheckout(event);
  };

  handleKeydown = (event) => {
    if (event.key !== "Enter" || event.repeat) {
      return;
    }

    const open = event.target.closest(this.selectors.openSideCart);
    if (!open) {
      return;
    }

    event.preventDefault();
    const tabId = open.dataset?.sidecartTab;
    if (tabId) {
      try {
        window.sessionStorage?.setItem("qf_sidecart_tab", tabId);
      } catch {}
    }
    this.cart.openSideCart();
  };

  handleSubmit = (event) => {
    const form = event.target.matches(this.selectors.discountForm)
      ? event.target
      : event.target.closest(this.selectors.discountForm);

    if (!form) {
      return;
    }

    event.preventDefault();
    const input = form.querySelector(this.selectors.discountInput);
    const code = input?.value?.trim();

    if (!code) {
      input?.focus();
      return;
    }

    this.cart.applyDiscount(code, { form }).finally(() => {
      form.classList.add('submitted');
    });
  };

  setupHoverPreload() {
    const triggers = document.querySelectorAll(this.selectors.hoverPreload);

    if (!triggers.length) {
      return;
    }

    if (this.hoverPreloadController) {
      this.hoverPreloadController.abort();
      this.hoverPreloadController = null;
      this.hoverBoundElements = new WeakSet();
    }

    const supportsAbort = typeof AbortController !== 'undefined';
    const supportsPointer = typeof window !== 'undefined' && 'PointerEvent' in window;

    if (supportsAbort) {
      this.hoverPreloadController = new AbortController();
    }

    const signal = this.hoverPreloadController?.signal;
    const onceOptions = signal ? { once: true, signal } : { once: true };
    const passiveOnceOptions = signal ? { once: true, passive: true, signal } : { once: true, passive: true };

    const preload = () => {
      if (this.state.hoverPreloaded) return;
      this.state.hoverPreloaded = true;
      this.cart.ensureDrawerContent({ includeRecommendations: false, reason: 'hover' });

      if (this.hoverPreloadController) {
        this.hoverPreloadController.abort();
        this.hoverPreloadController = null;
      }
    };

    triggers.forEach(trigger => {
      if (this.hoverBoundElements.has(trigger)) {
        return;
      }

      this.hoverBoundElements.add(trigger);

      if (supportsPointer) {
        trigger.addEventListener('pointerenter', preload, onceOptions);
        trigger.addEventListener('pointerdown', preload, passiveOnceOptions);
      } else {
        trigger.addEventListener('mouseenter', preload, onceOptions);
        trigger.addEventListener('touchstart', preload, passiveOnceOptions);
      }

      trigger.addEventListener('focus', preload, onceOptions);
    });
  }

  // Drawer drag protection — ignore click events that immediately follow a drag/swipe
  setupDrawerDragProtection() {
    // Use capture phase so we observe interactions early
    document.addEventListener('pointerdown', this._onPointerDown, true);
    document.addEventListener('pointermove', this._onPointerMove, true);
    document.addEventListener('pointerup', this._onPointerUp, true);

    // Touch fallbacks
    document.addEventListener('touchstart', this._onPointerDown, { passive: true, capture: true });
    document.addEventListener('touchmove', this._onPointerMove, { passive: true, capture: true });
    document.addEventListener('touchend', this._onPointerUp, true);
  }

  _onPointerDown = (e) => {
    // Only start tracking if the interaction originates from inside the drawer
    const container =
      e.target.closest('[data-cart-drawer],[cart-drawer-container]') ||
      e.target.closest('[data-cart-drawer-content],[side-cart-inner]');
    if (!container) return;

    const point = (e.touches && e.touches[0]) || e;
    this._drawerDrag.active = true;
    this._drawerDrag.pointerId = e.pointerId ?? (e.changedTouches ? 'touch' : null);
    this._drawerDrag.startX = point?.clientX ?? 0;
    this._drawerDrag.startY = point?.clientY ?? 0;
    this._drawerDrag.isDragging = false;
  };

  _onPointerMove = (e) => {
    if (!this._drawerDrag.active) return;
    const id = e.pointerId ?? (e.changedTouches ? 'touch' : null);
    if (this._drawerDrag.pointerId && id !== this._drawerDrag.pointerId) return;

    const point = (e.touches && e.touches[0]) || e;
    const dx = Math.abs((point?.clientX ?? 0) - this._drawerDrag.startX);
    const dy = Math.abs((point?.clientY ?? 0) - this._drawerDrag.startY);
    if (dx > 8 || dy > 8) {
      this._drawerDrag.isDragging = true;
    }
  };

  _onPointerUp = (e) => {
    if (!this._drawerDrag.active) return;
    const id = e.pointerId ?? (e.changedTouches ? 'touch' : null);
    if (this._drawerDrag.pointerId && id !== this._drawerDrag.pointerId) {
      this._drawerDrag.active = false;
      return;
    }

    const wasDragging = this._drawerDrag.isDragging;
    this._drawerDrag.active = false;
    this._drawerDrag.pointerId = null;
    this._drawerDrag.isDragging = false;
    this._drawerDrag.startX = 0;
    this._drawerDrag.startY = 0;

    if (wasDragging) {
      // Mark that the last interaction was a drag so we can ignore the subsequent click
      this._lastWasDrag = true;
      if (this._lastWasDragTimer) clearTimeout(this._lastWasDragTimer);
      this._lastWasDragTimer = setTimeout(() => {
        this._lastWasDrag = false;
        this._lastWasDragTimer = null;
      }, 50);
    }
  };

  toggleSideCart(event) {
    // Ignore clicks that immediately follow a drag inside the drawer (e.g., slider interactions)
    if (this._lastWasDrag) {
      this._lastWasDrag = false;
      return;
    }

    const open = event.target.closest(this.selectors.openSideCart);
    if (open) {
      event.preventDefault();
      const tabId = open.dataset?.sidecartTab;
      if (tabId) {
        try {
          window.sessionStorage?.setItem("qf_sidecart_tab", tabId);
        } catch {}
      }
      this.cart.openSideCart();
      return;
    }

    const close = event.target.closest(this.selectors.closeSideCart);
    const backdrop = event.target.matches('[data-cart-drawer],[cart-drawer-container]');

    if (close || backdrop) {
      event.preventDefault();
      this.cart.closeSideCart();
    }
  }

  toggleAdditionalCheckout(event) {
    const toggle = event.target.closest(this.selectors.additionalCheckoutToggle);
    if (!toggle) return;

    event.preventDefault();

    const trigger = document.querySelector(this.selectors.expressCheckoutTrigger);
    const section = document.querySelector(this.selectors.expressCheckoutSection);
    if (!trigger || !section) return;

    this.toggleExpressCheckout(section, trigger);
  }

  quantityButtons(event) {
    const increase = event.target.closest(this.selectors.quantityIncrease);
    if (increase) {
      void this.adjustQuantity(increase, 1);
      return;
    }

    const decrease = event.target.closest(this.selectors.quantityDecrease);
    if (decrease) {
      void this.adjustQuantity(decrease, -1);
    }
  }

  async adjustQuantity(button, delta) {
    if (!button || button.dataset.pending === 'true') return;

    // Resolve the outer line element for the key
    const line = button.closest('[data-cart-line],.item');
    // Prefer the inner quantity wrapper for reading the display/limits
    const quantityWrapper = button.closest('[data-cart-quantity]') || line;
    const quantityDisplay = quantityWrapper?.querySelector('[data-quantity-value],[data-cart-quantity-display],.quantity span');
    // Key must come from the line element which actually carries data-variant-key
    const key = line?.dataset.variantKey || line?.getAttribute('data-variant-key');
    const policy = quantityDisplay?.dataset.inventoryPolicy || quantityDisplay?.getAttribute('data-inventory-policy');
    const stock = parseInt(quantityDisplay?.dataset.stock ?? quantityDisplay?.getAttribute('data-stock') ?? '9999', 10);
    const currentQuantity = parseInt(quantityDisplay?.textContent?.trim() || '0', 10);

    if (!key || Number.isNaN(currentQuantity)) {
      return;
    }

    // Honour quantity rules from the quantity wrapper when present
    const stepAttr =
      quantityWrapper?.dataset?.step ||
      quantityWrapper?.getAttribute('data-step') ||
      '1';
    const minAttr =
      quantityWrapper?.dataset?.min ??
      quantityWrapper?.getAttribute('data-min') ??
      '';
    const maxAttr =
      quantityWrapper?.dataset?.max ??
      quantityWrapper?.getAttribute('data-max') ??
      '';

    const step = Math.max(1, parseInt(stepAttr, 10) || 1);
    const min = minAttr !== '' ? parseInt(minAttr, 10) : Number.NaN;
    const max = maxAttr !== '' ? parseInt(maxAttr, 10) : Number.NaN;
    const direction = delta > 0 ? 1 : -1;

    let nextQuantity = currentQuantity + direction * step;

    // Enforce a minimum from quantity rules on positive adjustments
    if (direction > 0 && !Number.isNaN(min) && nextQuantity < min) {
      nextQuantity = min;
    }

    // Enforce a maximum from quantity rules when provided
    if (!Number.isNaN(max) && max > 0 && nextQuantity > max) {
      nextQuantity = max;
    }

    // Still allow going down to 0 to remove a line via quantity controls
    nextQuantity = Math.max(0, nextQuantity);

    if (delta > 0 && policy === 'deny' && stock <= currentQuantity) {
      const title = quantityDisplay?.dataset.quantityLimitTitle;
      const message = quantityDisplay?.dataset.quantityLimitMessage;

      if (title && message) {
        toasty.addToast({ title, message: `${message} ${currentQuantity}`, delay: 2000 });
      }
      return;
    }

    if (nextQuantity === currentQuantity) {
      return;
    }

    button.dataset.pending = 'true';

    try {
      await this.cart.change({ id: key, quantity: nextQuantity }, { target: button });
    } catch (error) {
      if (error?.name !== 'AbortError') {
        // Toast notifications are handled in the cart service; nothing additional required here.
      }
    } finally {
      requestAnimationFrame(() => {
        delete button.dataset.pending;
      });
    }
  }

  async removeCartItem(event) {
    const remove = event.target.closest(this.selectors.removeButton);
    if (!remove) return;

    const line = remove.closest('[data-cart-line],.item');
    const key = line?.dataset.variantKey || line?.getAttribute('data-variant-key');

    if (!key) {
      return;
    }

    try {
      await this.cart.change({ id: key, quantity: 0 }, { target: remove });
    } catch (error) {
      if (error?.name !== 'AbortError') {
        // Errors surface via shared toast handling.
      }
    }
  }

  sideCartTabs(event) {
    const tab = event.target.closest(this.selectors.cartTabs);

    if (!tab) {
      return;
    }

    const tabId = tab.dataset.tab;
    if (!tabId) return;

    const tabList = tab.closest('[role="tablist"]') || tab.closest("nav") || tab.parentElement;
    const root =
      tab.closest("[data-cart-drawer-content],[side-cart-inner]") ||
      (tabList && tabList.parentElement) ||
      tab.closest("[data-cart-drawer],[cart-drawer-container]") ||
      document;

    const tabs = tabList
      ? tabList.querySelectorAll(this.selectors.cartTabs)
      : root.querySelectorAll(this.selectors.cartTabs);

    tabs.forEach((each) => {
      const isActive = each === tab;
      each.classList.toggle("active", isActive);
      each.setAttribute("aria-selected", isActive ? "true" : "false");
      each.setAttribute("tabindex", isActive ? "0" : "-1");
    });

    const panels = root.querySelectorAll("[data-cart-content]");
    panels.forEach((panel) => {
      if (panel.dataset.originalDisplay === undefined) {
        const inlineDisplay = panel.style.display;
        if (inlineDisplay && inlineDisplay !== "none") {
          panel.dataset.originalDisplay = inlineDisplay;
        } else {
          const computed = window.getComputedStyle ? window.getComputedStyle(panel).display : "";
          panel.dataset.originalDisplay = computed && computed !== "none" ? computed : "flex";
        }
      }

      const isActivePanel =
        panel.id === `sidecart-panel-${tabId}` || panel.classList.contains(tabId);

      if (isActivePanel) {
        panel.style.display = panel.dataset.originalDisplay || "flex";
        panel.removeAttribute("hidden");
        panel.setAttribute("aria-hidden", "false");
      } else {
        panel.style.display = "none";
        panel.setAttribute("hidden", "");
        panel.setAttribute("aria-hidden", "true");
      }
    });

    try {
      window.sessionStorage?.setItem("qf_sidecart_tab", tabId);
    } catch {}

    if (
      tabId === "wishlist" &&
      window.Wishlist &&
      typeof window.Wishlist.renderWishlist === "function"
    ) {
      window.Wishlist.renderWishlist();
    }
  }

  handleCartBusy = (event) => {
    const pending = event?.detail?.pending;
    this.toggleCartLoading(pending);
    const interactiveElements = this.collectInteractiveElements();

    interactiveElements.forEach(element => {
      this.toggleInteractiveElementState(element, pending);
    });
  };

  collectInteractiveElements() {
    const scopes = Array.from(document.querySelectorAll(this.selectors.disableDuringRequestScopes));
    const elements = new Set();

    scopes.forEach(scope => {
      scope.querySelectorAll('button, [data-cart-disable], input[type="submit"], a[data-cart-disable]').forEach(el => elements.add(el));
    });

    // Exclude the header cart link from being marked pending/loading to avoid
    // layout/icon shifts in the header after cart mutations.
    document.querySelectorAll(this.selectors.openSideCart).forEach(el => {
      if (el.classList && el.classList.contains('header__cart')) return;
      elements.add(el);
    });

    return Array.from(elements);
  }

  toggleInteractiveElementState(element, isPending) {
    if (!element) return;

    const isButtonLike = element.tagName === 'BUTTON' || element.matches('[data-cart-disable]') || element.matches('input[type="submit"]');

    if (isPending) {
      if (isButtonLike && !element.dataset.originalContent) {
        element.dataset.originalContent = element.innerHTML;
      }

      if (!isButtonLike && !element.dataset.originalText) {
        element.dataset.originalText = element.textContent;
      }

      element.classList.add('is-loading');
      element.setAttribute('aria-busy', 'true');

      if (isButtonLike) {
        element.disabled = true;
        element.setAttribute('aria-disabled', 'true');

        if (!element.dataset.originalText && element.childElementCount === 0) {
          element.dataset.originalText = element.textContent;
        }
      } else {
        element.setAttribute('aria-disabled', 'true');
      }

      return;
    }

    if (isButtonLike) {
      element.disabled = false;
      element.setAttribute('aria-disabled', 'false');
      element.classList.remove('is-loading');
      element.removeAttribute('aria-busy');

      if (element.dataset.originalContent) {
        element.innerHTML = element.dataset.originalContent;
        delete element.dataset.originalContent;
      } else if (element.dataset.originalText) {
        element.textContent = element.dataset.originalText;
        delete element.dataset.originalText;
      }
    } else {
      element.setAttribute('aria-disabled', 'false');
      element.classList.remove('is-loading');
      element.removeAttribute('aria-busy');

      // Only restore if we actually replaced text during pending
      if (element.dataset.textReplaced === 'true') {
        if (element.dataset.originalText) {
          element.textContent = element.dataset.originalText;
        }
        delete element.dataset.originalText;
        delete element.dataset.textReplaced;
      }
    }
  }

  handleDrawerOpened = () => {
    this.ensureExpressCheckoutBinding();
  };

  ensureExpressCheckoutBinding() {
    const trigger = document.querySelector(this.selectors.expressCheckoutTrigger);
    const section = document.querySelector(this.selectors.expressCheckoutSection);

    if (!trigger || !section || trigger.dataset.expressBound === 'true') {
      return;
    }

    trigger.dataset.expressBound = 'true';
    trigger.setAttribute('aria-expanded', section.classList.contains('is-open') ? 'true' : 'false');

    trigger.addEventListener('click', event => {
      event.preventDefault();
      this.toggleExpressCheckout(section, trigger);
    });
  }

  toggleExpressCheckout(section, trigger) {
    const isOpen = section.classList.contains('is-open');
    const nextState = !isOpen;

    section.classList.toggle('is-open', nextState);
    section.toggleAttribute('hidden', !nextState);
    trigger.setAttribute('aria-expanded', String(nextState));

    const openText = trigger.dataset.openText || trigger.getAttribute('data-open-express-checkout-options');
    const closeText = trigger.dataset.closeText || trigger.getAttribute('data-close-express-checkout-options');

    if (openText && closeText) {
      trigger.textContent = nextState ? closeText : openText;
    }

    this.bindExpressOutsideHandler(section, trigger, nextState);
  }

  bindExpressOutsideHandler(section, trigger, shouldBind) {
    if (shouldBind) {
      if (this.state.expressOutsideHandler) return;

      this.state.expressOutsideHandler = event => {
        const clickInsideSection = section.contains(event.target);
        const clickOnTrigger = trigger.contains(event.target);

        if (!clickInsideSection && !clickOnTrigger) {
          this.toggleExpressCheckout(section, trigger);
        }
      };

      document.addEventListener('click', this.state.expressOutsideHandler);
      return;
    }

    if (this.state.expressOutsideHandler) {
      document.removeEventListener('click', this.state.expressOutsideHandler);
      this.state.expressOutsideHandler = null;
    }
  }

  bindCartEvents() {
    const cartTarget = this.cart && typeof this.cart.addEventListener === 'function' ? this.cart : window;

    cartTarget.addEventListener('cart:busy', this.handleCartBusy);
    cartTarget.addEventListener('side_cart_opened', this.handleDrawerOpened);
    cartTarget.addEventListener('cart:sections-rendered', this.rebindDynamicElements);
    cartTarget.addEventListener('cart:discount-applied', () => {
      document.querySelectorAll(this.selectors.discountInput).forEach(input => {
        if (input) input.value = '';
      });
    });
  }

  rebindDynamicElements = () => {
    this.ensureExpressCheckoutBinding();
    this.bindDiscountInputs();
    this.setupHoverPreload();
    this.setupLoadingOverlays();
  };

  bindDiscountInputs() {
    document.querySelectorAll(this.selectors.discountForm).forEach(form => {
      form.setAttribute('novalidate', 'true');
    });
  }

  injectLoadingStyles() {
    if (document.getElementById('cart-loading-overlay-styles')) {
      return;
    }

    const style = document.createElement('style');
    style.id = 'cart-loading-overlay-styles';
    style.textContent = `
.cart-loading-overlay-target{position:relative;}
.cart-loading-overlay{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.85);opacity:0;pointer-events:none;transition:opacity 0.2s ease;z-index:5;}
.cart-loading-overlay.is-active{opacity:1;pointer-events:auto;}
.cart-loading-overlay__content{display:flex;align-items:center;gap:12px;padding:12px 16px;border-radius:999px;background:rgba(255,255,255,0.95);box-shadow:0 8px 24px rgba(15,23,42,0.1);}
.cart-loading-overlay__spinner{width:32px;height:32px;border-radius:50%;border:3px solid rgba(100,116,139,0.25);border-top-color:rgba(30,64,175,0.9);animation:cart-loading-spinner 0.65s linear infinite;}
.cart-loading-overlay__label{font-size:0.875rem;font-weight:500;color:rgba(15,23,42,0.75);letter-spacing:0.01em;}
@media (prefers-color-scheme: dark){
  .cart-loading-overlay{background:rgba(15,23,42,0.65);}
  .cart-loading-overlay__content{background:rgba(15,23,42,0.9);box-shadow:0 8px 24px rgba(2,6,23,0.4);}
  .cart-loading-overlay__spinner{border:3px solid rgba(148,163,184,0.25);border-top-color:rgba(191,219,254,0.95);}
  .cart-loading-overlay__label{color:rgba(226,232,240,0.9);}
}
@keyframes cart-loading-spinner{to{transform:rotate(360deg);}}
`;
    document.head.append(style);
  }

  setupLoadingOverlays() {
    const selectors = [
      this.cart?.selectors?.cartDrawerInner,
      this.cart?.selectors?.cartPageContainer,
    ].filter(Boolean);

    selectors.forEach(selector => {
      document.querySelectorAll(selector).forEach(container => {
        this.ensureLoadingOverlay(container);
      });
    });
  }

  ensureLoadingOverlay(container) {
    if (!container) return null;

    let overlay = container.querySelector(':scope > .cart-loading-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'cart-loading-overlay';
      overlay.setAttribute('aria-hidden', 'true');

      const content = document.createElement('div');
      content.className = 'cart-loading-overlay__content';

      const spinner = document.createElement('span');
      spinner.className = 'cart-loading-overlay__spinner';
      spinner.setAttribute('aria-hidden', 'true');

      const label = document.createElement('span');
      label.className = 'cart-loading-overlay__label';
      label.textContent = this.loadingLabel;

      content.append(spinner, label);
      overlay.append(content);
      container.append(overlay);
    }

    container.classList.add('cart-loading-overlay-target');
    this.loadingOverlays.set(container, overlay);
    return overlay;
  }

  toggleCartLoading(isPending) {
    const active = Boolean(isPending);
    const selectors = [
      this.cart?.selectors?.cartDrawerInner,
      this.cart?.selectors?.cartPageContainer,
    ].filter(Boolean);
    const drawerSelector = this.cart?.selectors?.cartDrawerInner;

    selectors.forEach(selector => {
      document.querySelectorAll(selector).forEach(container => {
        if (!container) return;
        const overlay = this.ensureLoadingOverlay(container);
        if (!overlay) return;

        const isDrawer = drawerSelector ? container.matches(drawerSelector) : false;

        // Avoid showing drawer overlay while it is closed when clearing busy state.
        if (!active && isDrawer && !document.body.classList.contains('cart-open')) {
          overlay.classList.remove('is-active');
          overlay.setAttribute('aria-hidden', 'true');
          return;
        }

        if (active) {
          overlay.classList.add('is-active');
          overlay.setAttribute('aria-hidden', 'false');
        } else {
          overlay.classList.remove('is-active');
          overlay.setAttribute('aria-hidden', 'true');
        }
      });
    });
  }
}

window.CartUIController = CartUIController;
