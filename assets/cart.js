import { toasty } from "@theme/toasty";
import {
  REQUEST_DELAY_MS,
  SECTION_HANDLES,
  SHOPIFY_HEADERS,
  UNIQUE_ARRAY,
} from "@theme/cart-constants";
import { cartMessages } from "@theme/cart-messages";
import { lockScroll, unlockScroll } from "@theme/scroll-lock";
import { renderSections as renderSectionsFn } from "./cart-render.js";
import "@theme/cart-prefetch";

export class CartRequestError extends Error {
  constructor({ action, status, response, payload, message, description } = {}) {
    super(message || cartMessages.errorTitle());
    this.name = "CartRequestError";
    this.action = action;
    this.status = status;
    this.payload = payload;
    this.response = response;
    this.description =
      description ?? (typeof response === "object" ? response?.description : undefined);
  }

  get friendlyTitle() {
    return this.message || cartMessages.errorTitle();
  }

  get friendlyDescription() {
    return typeof this.description === "string" && this.description.trim().length
      ? this.description
      : cartMessages.errorMessage();
  }
}

/**
 * Cart
 * - Networking: add/get/update/change/clear, request pipeline
 * - Section rendering: refreshSections, renderSections (delegates to renderer)
 * - Cart state + events: mergeAddItem, setCart, updateCartCount, legacy/custom events
 * - UI: open/close side cart, lazy-load cart-ui bindings, lazy-load recommendations
 */
export class Cart {
  // ----------------------------------------
  // Construction & configuration
  // ----------------------------------------
  constructor() {
    // Runtime cart snapshot (mirrors Shopify cart.js payload structure)
    this.cart = window.QF?.cart || { items: [] };

    // Shopify endpoints
    this.endpoints = {
      add: { url: "cart/add.js", method: "POST" },
      get: { url: "cart.js", method: "GET" },
      update: { url: "cart/update.js", method: "POST" },
      change: { url: "cart/change.js", method: "POST" },
      clear: { url: "cart/clear.js", method: "POST" },
      note: { url: "cart/update.js", method: "POST" },
    };

    // DOM selectors (back-compat support for legacy attributes)
    this.selectors = {
      cartDrawerContainer: "[data-cart-drawer],[cart-drawer-container]",
      cartDrawerInner: "[data-cart-drawer-content],[side-cart-inner]",
      cartItemsContainer: "[data-cart-items],[cart-items-container]",
      cartPageContainer: "[data-cart-container],[cart-container]",
      cartCount: "[data-cart-count],[cart-count],.cart-count",
      openSideCartTrigger: "[data-open-cart],[open-side-cart],.openSideCart",
      sideCartTabs: "[data-cart-tab],[side-cart-tab]",
      expressCheckoutTrigger:
        "[data-express-toggle],#express-checkout-trigger,express-checkout-trigger",
      expressCheckoutSection:
        "[data-express-section],#express-checkout-section,express-checkout-section",
      disableDuringRequest: "[data-cart-disable]",
    };

    // Section target config for server-rendered HTML
    this.sectionConfig = {
      [SECTION_HANDLES.drawer]: {
        targets: [this.selectors.cartDrawerInner],
        extractSelector: null,
      },
      [SECTION_HANDLES.cart]: {
        targets: [this.selectors.cartPageContainer],
        extractSelector: this.selectors.cartPageContainer,
      },
      [SECTION_HANDLES.recommendations]: {
        targets: [
          "[data-cart-recommendations-slider],[theme-settings-recommendations]",
          "[data-cart-recommendations-container],[side-cart-recommended-container]",
        ],
        extractSelector: null,
      },
    };

    // Internal state flags
    this.state = {
      isBusy: false,
      drawerHydrated: false,
    };

    this.requestControllers = new Map();
    this.events = new EventTarget();
    this.publicEvents = new Set([
      "cart:busy",
      "cart:count",
      "cart:updated",
      "cart:sections-rendered",
      "cart:discount-applied",
      "side_cart_opened",
      "side_cart_closed",
      "cart_rendered",
    ]);

    // Busy state timers
    this.pendingReenableTimer = null;
    this.pendingCount = 0;
    this.lastPendingStart = null;

    // In-flight dedupe for ensureDrawerContent
    this._ensureDrawerPromise = null;
  }

  // ----------------------------------------
  // Environment
  // ----------------------------------------
  get root() {
    const shopRoot = window.Shopify?.routes?.root || "/";
    try {
      return new URL(shopRoot, window.location.origin).toString();
    } catch {
      return `${window.location.origin}${shopRoot.startsWith("/") ? "" : "/"}${shopRoot}`;
    }
  }

  // ----------------------------------------
  // Events
  // ----------------------------------------
  dispatchEvent(name, detail = {}) {
    const internalEvent = new CustomEvent(name, { detail });
    this.events.dispatchEvent(internalEvent);

    if (this.publicEvents.has(name)) {
      window.dispatchEvent(new CustomEvent(name, { detail }));
    }
  }

  addEventListener(name, listener, options) {
    this.events.addEventListener(name, listener, options);
  }

  removeEventListener(name, listener, options) {
    this.events.removeEventListener(name, listener, options);
  }

  emitLegacyEvent(name, includeCart = false) {
    const detail = includeCart ? { cart: this.cart } : {};
    window.dispatchEvent(new CustomEvent(name, { detail }));
  }

  // ----------------------------------------
  // Section selection
  // ----------------------------------------
  getDefaultSections({ includeRecommendations = false } = {}) {
    const configured = document.body?.dataset?.cartSections;
    const configuredList = configured ? configured.split(",").map((s) => s.trim()) : [];
    const sections = configuredList.length
      ? configuredList
      : [SECTION_HANDLES.drawer, SECTION_HANDLES.cart];
    if (includeRecommendations) sections.push(SECTION_HANDLES.recommendations);
    return UNIQUE_ARRAY(sections);
  }

  // ----------------------------------------
  // Public API: cart operations
  // ----------------------------------------
  async add(data, options = {}) {
    let response;
    try {
      // Perform add without requesting sections in the same response
      response = await this.request("add", data, {
        includeRecommendations: true,
        requestName: options.requestName || "add",
        includeSections: options.includeSections ?? false,
        target: options.target,
      });
    } catch (error) {
      if (error?.name === "AbortError") {
        return this.cart;
      }
      throw error;
    }

    this.emitLegacyEvent("item_added", true);
    this.emitLegacyEvent("cart_changed", true);

    // Ensure the cart tab is active when the drawer opens after add-to-cart events.
    if (typeof window !== "undefined" && window.sessionStorage) {
      try {
        window.sessionStorage.setItem("qf_sidecart_tab", "cart");
      } catch (storageError) {
        // Ignore storage availability issues (e.g., private browsing)
      }
    }

    // Refresh sections once after add, then open the side cart
    try {
      const sections = this.getDefaultSections({ includeRecommendations: true });
      const refreshPromise = this.refreshSections(sections, { reason: "add" });

      await this.openSideCart({ ensureContent: false, includeRecommendations: true });
      await refreshPromise;

      const ctrl = await this.getRecommendationsController();
      if (ctrl?.state) ctrl.state.hydrated = false;

      let recsModal = null;
      if (window.matchMedia && window.matchMedia("(min-width:1200px)").matches) {
        try {
          const mod = await import("@theme/cart-recommendations-modal");
          recsModal = mod?.cartRecommendationsModal || null;
          recsModal?.mountFromTemplate?.();
        } catch (e) {
          console.warn("Cart: failed to mount recommendations modal before inject", e);
        }
      }

      try {
        const recommendationsSection =
          ctrl?.getRecommendationsSectionElement?.() ||
          document.querySelector("[data-cart-recommendations-section]");
        const sectionId =
          recommendationsSection?.dataset?.sectionId ||
          recommendationsSection?.getAttribute("data-section-id");
        const productId = this.getFirstProductId?.() || this.cart?.items?.[0]?.product_id || null;
        const max = recommendationsSection?.dataset?.limit ?? 5;

        if (ctrl?.fetchRecommendationMarkup && sectionId && productId) {
          const html = await ctrl.fetchRecommendationMarkup({ sectionId, productId, limit: max });
          if (html) {
            let injected = null;
            try {
              const wrapper = document.createElement("div");
              wrapper.innerHTML = html;
              const templateRoot = wrapper.querySelector("#cart-recs-modal-template, template");
              const sourceRoot = templateRoot?.content || wrapper;

              // Find side-cart target
              const sideContainer =
                document.querySelector(ctrl.selectors.cartRecommendationsContainer) ||
                document.querySelector(ctrl.selectors.cartRecommendationsSlider);

              // Find modal target (if open/available)
              const modalRoot = document.querySelector('[data-modal="cart-recommendations"]');
              const modalContainer = modalRoot
                ? modalRoot.querySelector(ctrl.selectors.cartRecommendationsContainer) ||
                modalRoot.querySelector(ctrl.selectors.cartRecommendationsSlider)
                : null;

              // Prepare replacement for side
              const wantsSideContainer = sideContainer?.matches?.(
                ctrl.selectors.cartRecommendationsContainer,
              );
              const replacementSide =
                (wantsSideContainer
                  ? sourceRoot.querySelector(ctrl.selectors.cartRecommendationsContainer)
                  : sourceRoot.querySelector(ctrl.selectors.cartRecommendationsSlider)) ||
                sourceRoot.querySelector(ctrl.selectors.cartRecommendationsContainer) ||
                sourceRoot.querySelector(ctrl.selectors.cartRecommendationsSlider) ||
                sourceRoot.querySelector(".cart-recommendations-slider") ||
                sourceRoot.querySelector("[data-blaze-slider]") ||
                sourceRoot.firstElementChild;

              // Inject into side-cart if possible
              if (replacementSide && sideContainer) {
                sideContainer.innerHTML = replacementSide.innerHTML ?? replacementSide.outerHTML;
                if (typeof ctrl.initRecommendationsSlider === "function")
                  ctrl.initRecommendationsSlider(document);
              }

              // Also inject into modal if present
              if (modalContainer) {
                const wantsModalContainer = modalContainer?.matches?.(
                  ctrl.selectors.cartRecommendationsContainer,
                );
                const replacementModal =
                  (wantsModalContainer
                    ? sourceRoot.querySelector(ctrl.selectors.cartRecommendationsContainer)
                    : sourceRoot.querySelector(ctrl.selectors.cartRecommendationsSlider)) ||
                  sourceRoot.querySelector(ctrl.selectors.cartRecommendationsContainer) ||
                  sourceRoot.querySelector(ctrl.selectors.cartRecommendationsSlider) ||
                  sourceRoot.querySelector(".cart-recommendations-slider") ||
                  sourceRoot.querySelector("[data-blaze-slider]") ||
                  sourceRoot.firstElementChild;
                if (replacementModal) {
                  modalContainer.innerHTML =
                    replacementModal.innerHTML ?? replacementModal.outerHTML;
                  if (typeof ctrl.initRecommendationsSlider === "function")
                    ctrl.initRecommendationsSlider(modalRoot);
                }
              }

              const hasProducts =
                (replacementSide?.querySelectorAll &&
                  replacementSide.querySelectorAll(".product").length > 0) ||
                (replacementSide?.querySelectorAll &&
                  replacementSide.querySelectorAll("slider-slide").length > 0);

              injected = { element: sideContainer || modalContainer, root: document, hasProducts };
            } catch (e) {
              // Fallback to controller's injection logic if anything goes wrong
              injected = await ctrl.injectRecommendationsMarkup(html);
            }

            if (!injected || !injected.hasProducts) {
              if (typeof ctrl?.hydrateFromSection === "function") await ctrl.hydrateFromSection();
            }
          } else if (typeof ctrl?.hydrateFromSection === "function") {
            await ctrl.hydrateFromSection();
          }
        } else if (typeof ctrl?.hydrateFromSection === "function") {
          await ctrl.hydrateFromSection();
        }
      } catch (e) {
        console.warn("Cart: client-side recommendations fetch failed, falling back", e);
        if (typeof ctrl?.hydrateFromSection === "function") await ctrl.hydrateFromSection();
      }

      // Open the recommendations modal after markup has been injected above.
      if (recsModal?.open) {
        try {
          await recsModal.open();
        } catch (e) {
          console.warn("Cart: failed to open recommendations modal", e);
        }
      }
    } catch (err) {
      console.warn("Cart: failed to refresh sections and open side cart after add", err);
      try {
        await this.ensureDrawerContent({ includeRecommendations: true, reason: "add-fallback" });
      } catch (ensureErr) {
        console.warn("Cart: failed to ensure drawer content after add fallback", ensureErr);
      }
    }

    return response.cart;
  }

  async get(options = {}) {
    const response = await this.request("get", options.query || {}, {
      includeSections: options.includeSections ?? false,
      requestName: options.requestName || "get",
      skipDelay: true,
      suppressPending: options.suppressPending ?? true,
      suppressEvents: options.suppressEvents ?? true,
    });
    return response.cart;
  }

  async update(data, options = {}) {
    let response;
    try {
      response = await this.request("update", data, {
        includeRecommendations: true,
        requestName: options.requestName || "update",
        includeSections: options.includeSections ?? true,
        target: options.target,
      });
    } catch (error) {
      if (error?.name === "AbortError") {
        return this.cart;
      }
      throw error;
    }
    this.emitLegacyEvent("cart_changed", true);
    return response.cart;
  }

  async change(data, options = {}) {
    let response;
    try {
      response = await this.request("change", data, {
        includeRecommendations: true,
        requestName: options.requestName || "change",
        includeSections: options.includeSections ?? true,
        target: options.target,
      });
    } catch (error) {
      if (error?.name === "AbortError") {
        return this.cart;
      }
      throw error;
    }

    this.emitLegacyEvent("cart_changed", true);

    if (this.cart?.items?.length === 0) {
      this.emitLegacyEvent("cart_cleared", true);
    }

    return response.cart;
  }

  async remove(variantId, options = {}) {
    const response = await this.change(
      { id: variantId, quantity: 0 },
      {
        ...options,
        requestName: options.requestName || "remove",
      },
    );
    this.emitLegacyEvent("item_removed", true);
    return response;
  }

  async clear(options = {}) {
    let response;
    try {
      response = await this.request(
        "clear",
        {},
        {
          includeRecommendations: false,
          requestName: options.requestName || "clear",
          includeSections: options.includeSections ?? true,
          target: options.target,
        },
      );
    } catch (error) {
      if (error?.name === "AbortError") {
        return this.cart;
      }
      throw error;
    }
    this.emitLegacyEvent("cart_cleared", true);
    this.emitLegacyEvent("cart_changed", true);
    return response.cart;
  }

  async applyDiscount(code, { form = null } = {}) {
    const trimmed = (code || "").trim();
    if (!trimmed) return;

    const requestName = "discount";
    const sections = this.getDefaultSections({ includeRecommendations: true });
    const url = new URL(`discount/${encodeURIComponent(trimmed)}`, this.root);
    url.searchParams.set("redirect", "cart");
    if (sections.length) url.searchParams.set("sections", sections.join(","));

    this.setPendingState(true, { requestName, target: form });

    try {
      const response = await fetch(url.toString(), {
        method: "GET",
        credentials: "same-origin",
        headers: SHOPIFY_HEADERS,
      });

      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const data = await response.json();
        if (data.sections) {
          this.renderSections(data.sections, { reason: requestName });
        }
        await this.refreshCartData({ silent: true });
        this.dispatchEvent("cart:discount-applied", { code: trimmed });
      } else {
        window.location.href = url.toString();
      }
    } catch (error) {
      this.handleRequestError(error);
    } finally {
      this.setPendingState(false, { requestName, target: form });
    }
  }

  // ----------------------------------------
  // Networking
  // ----------------------------------------
  getRequestControllerKey(action, requestName) {
    if (!action || action === "get") {
      return null;
    }
    return `${action}:${requestName || action}`;
  }

  async request(action, payload = {}, options = {}) {
    const endpoint = this.endpoints[action];
    if (!endpoint) {
      throw new Error(`Unknown cart action: ${action}`);
    }

    const {
      includeSections = true,
      includeRecommendations = false,
      requestName = action,
      sections,
      target = null,
      skipDelay = false,
      suppressPending = false,
      suppressEvents = false,
    } = options;

    const sectionsToRender = includeSections
      ? UNIQUE_ARRAY(sections || this.getDefaultSections({ includeRecommendations }))
      : [];

    const method = endpoint.method.toUpperCase();
    const url = new URL(endpoint.url, this.root);
    if (sectionsToRender.length) {
      url.searchParams.set("sections", sectionsToRender.join(","));
    }

    let body;
    const headers = { ...SHOPIFY_HEADERS };
    let controllerKey = null;
    let controller = null;

    if (method === "GET") {
      if (payload && typeof payload === "object") {
        Object.entries(payload).forEach(([key, value]) => {
          if (value === undefined || value === null) return;
          url.searchParams.set(key, value);
        });
      }
    } else if (payload instanceof FormData) {
      body = payload;
    } else {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(payload || {});
    }

    if (typeof AbortController !== "undefined") {
      controllerKey = this.getRequestControllerKey(action, requestName);
      if (controllerKey) {
        controller = new AbortController();
        const inflight = this.requestControllers.get(controllerKey);
        if (inflight) {
          try {
            inflight.abort();
          } catch { }
        }
        this.requestControllers.set(controllerKey, controller);
      }
    }

    if (!suppressPending) {
      this.setPendingState(true, { requestName, target });
    }

    try {
      if (!skipDelay) {
        await this.delay(REQUEST_DELAY_MS);
      }

      const response = await fetch(url.toString(), {
        method,
        headers,
        body,
        credentials: "same-origin",
        signal: controller?.signal,
      });

      const contentType = response.headers.get("content-type") || "";
      let data = contentType.includes("application/json")
        ? await response.json()
        : await response.text();

      if (typeof data === "string") {
        const trimmed = data.trim();
        if (trimmed && (trimmed.startsWith("{") || trimmed.startsWith("["))) {
          try {
            data = JSON.parse(trimmed);
          } catch {
            // leave as string; downstream will handle
          }
        }
      }

      if (!response.ok) {
        const payloadData = typeof data === "object" && data !== null ? data : {};
        throw new CartRequestError({
          action,
          status: response.status,
          response: data,
          payload,
          message:
            payloadData.message ||
            payloadData.description ||
            (typeof data === "string" ? data : undefined),
          description: payloadData.description,
        });
      }

      return await this.handleRequestSuccess({
        action,
        requestName,
        responseData: data,
        sectionsToRender,
        suppressEvents,
      });
    } catch (error) {
      if (error?.name === "AbortError") {
        throw error;
      }
      this.handleRequestError(error);
      throw error;
    } finally {
      if (!suppressPending) {
        this.setPendingState(false, { requestName, target });
      }
      if (controllerKey && this.requestControllers.get(controllerKey) === controller) {
        this.requestControllers.delete(controllerKey);
      }
    }
  }

  async handleRequestSuccess({
    action,
    requestName,
    responseData,
    sectionsToRender,
    suppressEvents,
  }) {
    let sectionsFromResponse = null;

    if (responseData && typeof responseData === "object" && responseData.sections) {
      sectionsFromResponse = responseData.sections;
    }

    const isCartLike = (obj) =>
      obj &&
      typeof obj === "object" &&
      Array.isArray(obj.items) &&
      typeof obj.item_count === "number";

    // Update local cart snapshot from response if present
    if (responseData && typeof responseData === "object") {
      if (responseData.cart && isCartLike(responseData.cart)) {
        this.setCart(responseData.cart);
      } else if (isCartLike(responseData)) {
        // cart.js (GET) returns the cart object directly
        this.setCart(responseData);
      } else if (Array.isArray(responseData)) {
        // cart/add.js can return an array of items
        responseData.forEach((item) => this.mergeAddItem(item));
        this.updateCartCount();
      } else if (responseData.items && Array.isArray(responseData.items)) {
        // Some responses include only { items: [...] } - rebuild items and recalc count
        this.cart.items = [];
        responseData.items.forEach((item) => this.mergeAddItem(item));
        this.cart.item_count = (this.cart.items || []).reduce(
          (sum, it) => sum + (it.quantity || 0),
          0,
        );
        this.updateCartCount();
      } else if (responseData.item) {
        // Single item payload
        this.mergeAddItem(responseData.item);
      }
    }

    // Render any returned sections or fallback refresh
    if (sectionsFromResponse) {
      this.renderSections(sectionsFromResponse, { reason: requestName });

      // Fallback: if the server returned a cart-recommendations section, inject it
      // directly into the active recommendations modal (if present). renderSections
      // intentionally avoids mutating modal content, so when sections are returned
      // from the server we must mirror the markup into the modal to keep it in sync.
      (async () => {
        try {
          const recHtml =
            sectionsFromResponse["cart-recommendations"] ||
            sectionsFromResponse["cart_recommendations"] ||
            sectionsFromResponse["recommendations"] ||
            null;
          if (!recHtml) return;

          const ctrl = await this.getRecommendationsController();
          if (!ctrl) return;

          const modalRoot = document.querySelector('[data-modal="cart-recommendations"]');
          if (!modalRoot) return;

          const modalContainer =
            modalRoot.querySelector(ctrl.selectors.cartRecommendationsContainer) ||
            modalRoot.querySelector(ctrl.selectors.cartRecommendationsSlider);
          if (!modalContainer) return;

          const wrapper = document.createElement("div");
          wrapper.innerHTML = recHtml;

          const wantsModalContainer = modalContainer?.matches?.(
            ctrl.selectors.cartRecommendationsContainer,
          );
          const replacementModal =
            (wantsModalContainer
              ? wrapper.querySelector(ctrl.selectors.cartRecommendationsContainer)
              : wrapper.querySelector(ctrl.selectors.cartRecommendationsSlider)) ||
            wrapper.querySelector(ctrl.selectors.cartRecommendationsContainer) ||
            wrapper.querySelector(ctrl.selectors.cartRecommendationsSlider) ||
            wrapper.firstElementChild;

          if (replacementModal) {
            modalContainer.innerHTML = replacementModal.innerHTML ?? replacementModal.outerHTML;
            if (typeof ctrl.initRecommendationsSlider === "function") {
              try {
                ctrl.initRecommendationsSlider(modalRoot);
              } catch (err) {
                /* ignore init errors */
              }
            }
          }
        } catch (err) {
          console.warn(
            "Cart: failed to inject recommendations into modal from sections response",
            err,
          );
        }
      })();
    } else if (sectionsToRender.length && requestName !== "add") {
      await this.refreshSections(sectionsToRender, {
        reason: `${requestName}:fallback`,
        skipPending: true,
      });
    }

    // For any mutating action, ensure we end with the exact server cart
    if (action !== "get") {
      if (!responseData || (!responseData.cart && !isCartLike(responseData))) {
        await this.refreshCartData({ silent: true });
      }
      // Sync count after potential refresh
      this.updateCartCount();
      this.dispatchEvent("cart:count", {
        itemCount: this.cart?.item_count || 0,
      });
    }

    if (!suppressEvents) {
      this.dispatchEvent("cart:updated", {
        action,
        requestName,
        cart: this.cart,
        sections: sectionsToRender,
      });
    }

    return { cart: this.cart, response: responseData };
  }

  // ----------------------------------------
  // Sections: cart state & rendering
  // ----------------------------------------
  async refreshCartData({ silent = false } = {}) {
    try {
      const response = await this.request(
        "get",
        {},
        {
          includeSections: false,
          skipDelay: true,
          suppressPending: true,
          suppressEvents: silent,
          requestName: "refresh",
        },
      );
      return response.cart;
    } catch (error) {
      console.warn("Unable to refresh cart state", error);
      return this.cart;
    }
  }

  async refreshSections(sections, { reason = "manual", skipPending = false } = {}) {
    const sectionList = UNIQUE_ARRAY(sections);
    if (!sectionList.length) return;

    if (!skipPending) {
      this.setPendingState(true, { requestName: `${reason}:sections` });
    }

    try {
      const url = new URL("cart", this.root);
      url.searchParams.set("sections", sectionList.join(","));

      const response = await fetch(url.toString(), {
        method: "GET",
        headers: { "X-Requested-With": "XMLHttpRequest" },
        credentials: "same-origin",
      });

      if (!response.ok) {
        let err;
        try {
          err = await response.json();
        } catch {
          err = new Error("Sections request failed");
        }
        throw err;
      }

      const data = await response.json();
      this.renderSections(data, { reason });
    } catch (error) {
      this.handleRequestError(error);
    } finally {
      if (!skipPending) {
        this.setPendingState(false, { requestName: `${reason}:sections` });
      }
    }
  }

  renderSections(sections, { reason = "" } = {}) {
    renderSectionsFn(this, sections, reason);
  }

  // ----------------------------------------
  // Recommendations: lazy controller
  // ----------------------------------------
  async getRecommendationsController() {
    if (this._recController) return this._recController;
    if (!this._recImport) {
      this._recImport = import("@theme/cart-recommendations")
        .then((mod) => {
          const ctrl =
            mod.cartRecommendations ||
            mod.default ||
            (mod.CartRecommendationsController ? new mod.CartRecommendationsController() : null);
          if (ctrl?.setCart) ctrl.setCart(this);
          this._recController = ctrl;
          return ctrl;
        })
        .catch((err) => {
          console.warn("Cart: failed to load recommendations module", err);
          this._recImport = null;
          return null;
        });
    }
    return this._recImport;
  }

  // ----------------------------------------
  // Cart state helpers
  // ----------------------------------------
  mergeAddItem(item) {
    if (!item) return;

    if (!Array.isArray(this.cart.items)) {
      this.cart.items = [];
    }

    const existingIndex = this.cart.items.findIndex(
      (existing) => existing.key === item.key || existing.id === item.id,
    );
    const previousItem = existingIndex > -1 ? this.cart.items[existingIndex] : null;

    if (existingIndex > -1) {
      this.cart.items[existingIndex] = { ...previousItem, ...item };
    } else {
      this.cart.items.push(item);
    }

    const previousQuantity = previousItem?.quantity || 0;
    const quantityDelta = (item?.quantity || 0) - previousQuantity;
    const currentCount = this.cart?.item_count || 0;

    this.cart.item_count = Math.max(0, currentCount + quantityDelta);
  }

  setCart(cart) {
    if (cart && typeof cart === "object") {
      this.cart = cart;
    }
    this.updateCartCount();
    return this.cart;
  }

  updateCartCount() {
    // Preserve existing visible count if cart.item_count is not yet known to avoid zeroing the header badge.
    const hasNumber =
      typeof this.cart?.item_count === "number" && Number.isFinite(this.cart.item_count);
    const nextCount = hasNumber ? this.cart.item_count : null;

    document.querySelectorAll(this.selectors.cartCount).forEach((node) => {
      if (!node) return;
      const current = parseInt((node.textContent || "").trim(), 10);
      const safeCurrent = Number.isFinite(current) ? current : 0;
      const value = nextCount === null ? safeCurrent : nextCount;

      // Debug signal: helps validate that we aren't overwriting with 0 on sections-rendered without cart payload
      // Optional debug hook removed to avoid noisy console output

      node.textContent = value;
      node.classList.toggle("empty-cart", value === 0);
    });
  }

  // Explicit setter to force-sync the count UI with a known value (used by event listeners)
  syncCartCountExplicit(count) {
    const value = typeof count === "number" ? count : (this.cart?.item_count ?? 0);
    document.querySelectorAll(this.selectors.cartCount).forEach((node) => {
      if (!node) return;
      node.textContent = value;
      node.classList.toggle("empty-cart", value === 0);
    });
  }

  // ----------------------------------------
  // UI: ensure content, open/close drawer
  // ----------------------------------------
  async ensureDrawerContent({ includeRecommendations = false, reason = "drawer-open" } = {}) {
    // Debug: start + whether a prefetch promise exists

    // If a hover prefetch is in-flight, await it to avoid duplicate section requests
    try {
      const pf = window?.cart?._prefetchPromise;
      if (pf && typeof pf.then === "function") {
        await pf;
      }
    } catch {
      // ignore prefetch errors
    }

    // If the drawer has already been hydrated (possibly by prefetch), only ensure recommendations if requested
    if (this.state.drawerHydrated) {
      if (includeRecommendations) {
        const ctrl = await this.getRecommendationsController();
        if (ctrl?.loadRecommendations) await ctrl.loadRecommendations();
      }
      return;
    }

    // If an ensure is already in-flight, reuse it
    if (this._ensureDrawerPromise) {
      await this._ensureDrawerPromise;
      if (includeRecommendations) {
        const ctrl = await this.getRecommendationsController();
        if (ctrl?.loadRecommendations) await ctrl.loadRecommendations();
      }
      return;
    }

    // Create and assign the in-flight ensure promise
    this._ensureDrawerPromise = (async () => {
      const sections = this.getDefaultSections({ includeRecommendations });
      await this.refreshSections(sections, { reason });
      this.state.drawerHydrated = true;
    })().finally(() => {
      // Always clear the in-flight promise
      this._ensureDrawerPromise = null;
    });

    // Await ensure completion before proceeding
    await this._ensureDrawerPromise;

    // Optionally ensure recommendations after hydration completes
    if (includeRecommendations) {
      const ctrl = await this.getRecommendationsController();
      if (ctrl?.loadRecommendations) await ctrl.loadRecommendations();
    }
  }

  async openSideCart({ ensureContent = true, includeRecommendations = true } = {}) {
    // QF-cart-fix: prevent duplicate open/fetch when multiple listeners trigger openSideCart
    // Defensive guard: if we're already performing an open or the drawer is already open, do nothing.
    if (this._openingSideCart) return;
    const maybeSideCart = document.querySelector(this.selectors.cartDrawerContainer);
    if (maybeSideCart && maybeSideCart.classList.contains("is-open")) return;
    this._openingSideCart = true;
    try {
      let ensurePromise = Promise.resolve();
      if (ensureContent) {
        ensurePromise = this.ensureDrawerContent({ includeRecommendations, reason: "drawer-open" });
      } else if (includeRecommendations) {
        ensurePromise = this.getRecommendationsController()
          .then((ctrl) => ctrl?.loadRecommendations?.())
          .catch((err) => {
            console.warn("Cart: failed to preload recommendations controller", err);
          });
      }

      const sideCartContainer = document.querySelector(this.selectors.cartDrawerContainer);
      if (!sideCartContainer) {
        try {
          await ensurePromise;
        } catch {
          // already logged above
        }
        return;
      }

      lockScroll("sidecart");
      sideCartContainer.classList.add("open", "is-open");
      sideCartContainer.setAttribute("aria-hidden", "false");
      // Drawer is interactive while open
      sideCartContainer.removeAttribute("inert");

      // Body scroll locking + compensation
      const scrollbarComp = window.innerWidth - document.documentElement.clientWidth;
      if (scrollbarComp > 0) {
        document.body.style.setProperty("--scrollbar-comp", `${scrollbarComp}px`);
      }
      document.body.classList.add("cart-open");

      // ARIA on triggers
      document.querySelectorAll(this.selectors.openSideCartTrigger).forEach((trigger) => {
        trigger.setAttribute("aria-expanded", "true");
      });

      // Fit viewport height
      sideCartContainer.style.height = `${window.innerHeight}px`;
      const resizeHandler = () => {
        sideCartContainer.style.height = `${window.innerHeight}px`;
      };
      window.addEventListener("resize", resizeHandler);
      this.resizeHandler = resizeHandler;

      this.dispatchEvent("side_cart_opened", { cart: this.cart });

      try {
        await ensurePromise;
      } catch (error) {
        console.warn("Cart: drawer ensure failed during open", error);
      }

      if (!includeRecommendations) {
        return;
      }

      // Ensure the recommendations modal is loaded and opened whenever the drawer opens
      try {
        const mod = await import("@theme/cart-recommendations-modal");
        if (mod?.cartRecommendationsModal?.open) {
          mod.cartRecommendationsModal.open();
        }
      } catch (e) {
        console.warn("Cart: failed to open recommendations modal on drawer open", e);
      }
    } finally {
      // Clear the opening flag on completion or early exit/error
      this._openingSideCart = false;
    }
  }

  closeSideCart() {
    const sideCartContainer = document.querySelector(this.selectors.cartDrawerContainer);
    if (!sideCartContainer) return;

    sideCartContainer.classList.remove("open", "is-open");

    // If focus is inside the drawer, blur it BEFORE hiding from AT to avoid a11y warnings
    const activeEl = document.activeElement;
    if (activeEl && sideCartContainer.contains(activeEl)) {
      try {
        activeEl.blur();
      } catch { }
    }
    // Prevent focus from entering while hidden
    sideCartContainer.setAttribute("inert", "");
    sideCartContainer.setAttribute("aria-hidden", "true");

    // Optionally restore focus to the open trigger for good keyboard UX
    const triggerToFocus = document.querySelector(this.selectors.openSideCartTrigger);
    if (triggerToFocus && typeof triggerToFocus.focus === "function") {
      try {
        triggerToFocus.focus();
      } catch { }
    }

    unlockScroll("sidecart");
    document.body.classList.remove("cart-open");
    document.body.style.removeProperty("--scrollbar-comp");

    document.querySelectorAll(this.selectors.openSideCartTrigger).forEach((trigger) => {
      trigger.setAttribute("aria-expanded", "false");
    });

    if (this.resizeHandler) {
      window.removeEventListener("resize", this.resizeHandler);
      this.resizeHandler = null;
    }

    this.dispatchEvent("side_cart_closed", {});
  }

  // ----------------------------------------
  // Busy state & utilities
  // ----------------------------------------
  setPendingState(isPending, { requestName = "", target = null } = {}) {
    if (isPending) {
      this.pendingCount += 1;
      this.lastPendingStart = Date.now();

      if (!this.state.isBusy) {
        this.state.isBusy = true;
        this.dispatchEvent("cart:busy", { pending: true, requestName });
      }
      return;
    }

    // Releasing: if multiple pending, wait until all finished
    if (this.pendingCount > 0) {
      this.pendingCount = Math.max(0, this.pendingCount - 1);
    }
    if (this.pendingCount > 0 || !this.state.isBusy) {
      return;
    }

    if (this.pendingReenableTimer) {
      clearTimeout(this.pendingReenableTimer);
    }

    const release = () => {
      this.state.isBusy = false;
      this.pendingCount = 0;
      this.dispatchEvent("cart:busy", { pending: false, requestName });
      this.lastPendingStart = null;
      this.pendingReenableTimer = null;
    };

    const elapsed = this.lastPendingStart ? Date.now() - this.lastPendingStart : REQUEST_DELAY_MS;
    const remaining = Math.max(0, REQUEST_DELAY_MS - elapsed);
    this.pendingReenableTimer = setTimeout(release, remaining);
  }

  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  handleRequestError(error) {
    if (!error || error?.name === "AbortError") {
      return;
    }

    const title =
      error instanceof CartRequestError && typeof error.friendlyTitle === "string"
        ? error.friendlyTitle
        : typeof error?.message === "string" && error.message.trim().length
          ? error.message
          : cartMessages.errorTitle();

    const message =
      error instanceof CartRequestError && typeof error.friendlyDescription === "string"
        ? error.friendlyDescription
        : typeof error?.description === "string" && error.description.trim().length
          ? error.description
          : cartMessages.errorMessage();

    // Surface cart errors via the theme toasty system (shows title + message for ~5s)
    toasty.addToast({ title, delay: 5000 });
    console.error("Cart request error", error);
  }
}

// ----------------------------------------
// Lazy-load Cart UI on first cart interaction/open
// ----------------------------------------
const loadCartUIOnce = (() => {
  let loaded = false;
  let inflight = null;
  return () => {
    if (loaded) return inflight || Promise.resolve();
    loaded = true;
    inflight = import("@theme/cart-ui")
      .then((mod) => {
        const Ctor = mod.CartUIController || mod.default;
        if (typeof Ctor === "function") new Ctor();
      })
      .catch((err) => {
        console.warn("Cart: failed to load cart-ui", err);
        // allow retry on transient errors
        loaded = false;
        inflight = null;
      });
    return inflight;
  };
})();

// Export cart instance early so UI and other modules can reference it
export const cart = new Cart();
window.cart = cart;

const cartEventTarget = typeof cart.addEventListener === "function" ? cart : window;

// Keep the header/cart badges in sync whenever cart events fire,
// even if sections render without a full cart payload.
cartEventTarget.addEventListener("cart:count", (e) => {
  const n = e?.detail?.itemCount;
  if (typeof n === "number") {
    try {
      cart.syncCartCountExplicit(n);
    } catch { }
  } else {
    try {
      cart.updateCartCount();
    } catch { }
  }
});

// Redundant safety: after any cart update or section re-render, re-sync the count
cartEventTarget.addEventListener("cart:updated", () => {
  try {
    cart.updateCartCount();
  } catch { }
});
cartEventTarget.addEventListener("cart:sections-rendered", () => {
  try {
    cart.updateCartCount();
  } catch { }
});

// Bind a one-time lazy UI boot specifically to cart interactions
const bindCartUIBoot = (cart) => {
  let booted = false;

  const boot = () => {
    if (booted) return;
    booted = true;
    loadCartUIOnce();
    remove();
  };

  const matchesCartTarget = (el) =>
    !!(
      el?.closest?.(cart.selectors.openSideCartTrigger) ||
      el?.closest?.(cart.selectors.cartDrawerContainer) ||
      el?.closest?.(cart.selectors.cartPageContainer)
    );

  const onClick = (e) => {
    const target = e.target;
    if (!target) return;
    const isOpenTrigger = target.closest?.(cart.selectors.openSideCartTrigger);
    if (isOpenTrigger) {
      e.preventDefault();
      const tabId = isOpenTrigger.dataset?.sidecartTab;
      if (tabId) {
        try {
          window.sessionStorage?.setItem("qf_sidecart_tab", tabId);
        } catch {}
      }
      boot();
      // Ensure the drawer opens even if UI isn't bound yet
      Promise.resolve().then(() => cart.openSideCart());
      return;
    }
    if (matchesCartTarget(target)) boot();
  };

  const onTouchStart = (e) => {
    if (matchesCartTarget(e.target)) boot();
  };

  const onKeydown = (e) => {
    if ((e.key === "Enter" || e.key === " ") && matchesCartTarget(e.target)) boot();
  };

  const onOpened = () => boot();

  function remove() {
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("touchstart", onTouchStart, true);
    document.removeEventListener("keydown", onKeydown, true);
    window.removeEventListener("side_cart_opened", onOpened);
  }

  document.addEventListener("click", onClick, true);
  document.addEventListener("touchstart", onTouchStart, true);
  document.addEventListener("keydown", onKeydown, true);
  window.addEventListener("side_cart_opened", onOpened);
};
bindCartUIBoot(cart);
