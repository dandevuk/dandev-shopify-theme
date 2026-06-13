import { cart } from "@theme/cart";
import { ModalController } from "@theme/modal-controller";
import { cartRecommendations as recControllerDefault } from "@theme/cart-recommendations";

export class CartRecommendationsModal {
  constructor({ autoBind = true } = {}) {
    this.cart = cart;
    this.modal = new ModalController();
    this.recController = recControllerDefault || null;
    this.state = {
      bound: false,
      lastOpenedAt: 0,
      minIntervalMs: 400, // debounce rapid adds
      isOpen: false,
      syncClosing: false, // prevents close loops between modal and sidecart
    };
    this.elements = {
      overlay: null,
      container: null,
    };
    this.listenerRemovers = [];
    this.abortController = null;
    this.mediaQuery = null;
    this.mediaQueryChangeHandler = null;
    this.resizeDebounceTimer = null;

    // Bind handlers that are used as listeners
    this.handleCartUpdated = this.handleCartUpdated.bind(this);
    this.handleSectionsRendered = this.handleSectionsRendered.bind(this);
    this.handleSideCartOpened = this.handleSideCartOpened.bind(this);
    this.handleSideCartClosed = this.handleSideCartClosed.bind(this);
    this.handleModalClosed = this.handleModalClosed.bind(this);
    this.handleDocumentClick = this.handleDocumentClick.bind(this);
    this.handleResize = this.handleResize.bind(this);
    this.handleBreakpointChange = this.handleBreakpointChange.bind(this);

    if (autoBind) this.bind();
  }

  addListener(target, type, handler, options = {}) {
    if (!target || typeof target.addEventListener !== "function") return;

    const listenerOptions = { ...options };
    if (!listenerOptions.signal && this.abortController?.signal) {
      listenerOptions.signal = this.abortController.signal;
    }

    target.addEventListener(type, handler, listenerOptions);

    const capture =
      typeof options === "object" &&
        options !== null &&
        Object.prototype.hasOwnProperty.call(options, "capture")
        ? options.capture
        : false;

    this.listenerRemovers.push(() => {
      if (typeof target.removeEventListener === "function") {
        try {
          target.removeEventListener(type, handler, capture);
        } catch (err) {
          console.warn(`CartRecommendationsModal: failed to remove listener for ${type}`, err);
        }
      }
    });
  }

  bind() {
    if (this.state.bound) return;

    if (typeof window === "undefined" || typeof document === "undefined") {
      this.state.bound = true;
      return;
    }

    this.abortController = new AbortController();
    this.listenerRemovers = [];

    this.addListener(window, "cart:updated", this.handleCartUpdated);
    this.addListener(window, "cart:sections-rendered", this.handleSectionsRendered);
    this.addListener(window, "side_cart_opened", this.handleSideCartOpened);
    this.addListener(window, "side_cart_closed", this.handleSideCartClosed);
    this.addListener(window, "cart-recommendations-modal-closed", this.handleModalClosed);
    this.addListener(document, "click", this.handleDocumentClick);
    this.addListener(window, "resize", this.handleResize, { passive: true });

    try {
      if (typeof window !== "undefined" && window.matchMedia) {
        this.mediaQuery = window.matchMedia("(min-width:1200px)");
        this.mediaQueryChangeHandler = this.handleBreakpointChange;

        if (typeof this.mediaQuery.addEventListener === "function") {
          this.mediaQuery.addEventListener("change", this.mediaQueryChangeHandler);
        } else if (typeof this.mediaQuery.addListener === "function") {
          this.mediaQuery.addListener(this.mediaQueryChangeHandler);
        }

        if (
          this.abortController?.signal &&
          typeof this.abortController.signal.addEventListener === "function"
        ) {
          this.abortController.signal.addEventListener(
            "abort",
            () => {
              if (!this.mediaQuery) return;
              if (typeof this.mediaQuery.removeEventListener === "function") {
                this.mediaQuery.removeEventListener("change", this.mediaQueryChangeHandler);
              } else if (typeof this.mediaQuery.removeListener === "function") {
                this.mediaQuery.removeListener(this.mediaQueryChangeHandler);
              }
            },
            { once: true },
          );
        }
      }
    } catch (err) {
      console.warn("CartRecommendationsModal: failed to initialise viewport listeners", err);
    }

    this.state.bound = true;
  }

  teardownMatchMedia() {
    if (!this.mediaQuery || !this.mediaQueryChangeHandler) return;

    try {
      if (typeof this.mediaQuery.removeEventListener === "function") {
        this.mediaQuery.removeEventListener("change", this.mediaQueryChangeHandler);
      } else if (typeof this.mediaQuery.removeListener === "function") {
        this.mediaQuery.removeListener(this.mediaQueryChangeHandler);
      }
    } catch (err) {
      console.warn("CartRecommendationsModal: failed to remove media query listener", err);
    }

    this.mediaQuery = null;
    this.mediaQueryChangeHandler = null;
  }

  destroy() {
    if (!this.state.bound) return;

    if (this.abortController) {
      try {
        this.abortController.abort();
      } catch (err) {
        console.warn("CartRecommendationsModal: aborting listeners failed", err);
      }
    }

    this.listenerRemovers.forEach((remove) => {
      try {
        remove();
      } catch (err) {
        console.warn("CartRecommendationsModal: removing listener failed", err);
      }
    });
    this.listenerRemovers = [];

    this.teardownMatchMedia();

    if (this.resizeDebounceTimer) {
      const clear = typeof window !== "undefined" ? window.clearTimeout : clearTimeout;
      clear(this.resizeDebounceTimer);
      this.resizeDebounceTimer = null;
    }

    this.abortController = null;
    this.state.bound = false;
  }

  syncModalWithViewport(matches) {
    const drawer = document.querySelector(this.cart.selectors.cartDrawerContainer);
    const drawerOpen = !!(drawer && drawer.classList && drawer.classList.contains("is-open"));

    if (!matches) {
      if (this.state.isOpen) {
        this.state.syncClosing = true;
        try {
          this.close();
        } finally {
          this.state.syncClosing = false;
        }
      }
      return;
    }

    if (matches && drawerOpen && !this.state.isOpen) {
      Promise.resolve(this.open()).catch(() => {
        // ignore reopen failures caused by race conditions
      });
    }
  }

  handleSectionsRendered(event) {
    if (!this.state.isOpen) return;
    try {
      const sections = event?.detail?.sections || [];
      const shouldReload =
        Array.isArray(sections) &&
        (sections.includes("cart-recommendations") ||
          sections.includes("drawer") ||
          sections.includes("cart"));
      if (shouldReload) {
        this.reloadRecommendations().catch((err) => {
          console.warn("CartRecommendationsModal: failed to reload after sections-rendered", err);
        });
      }
    } catch (err) {
      console.warn("CartRecommendationsModal: sections-rendered handler failed", err);
    }
  }

  handleSideCartOpened() {
    Promise.resolve(this.open()).catch((err) => {
      console.warn("CartRecommendationsModal: failed to open when sidecart opened", err);
    });
  }

  handleSideCartClosed() {
    if (this.state.syncClosing || !this.state.isOpen) return;
    this.state.syncClosing = true;
    try {
      this.close();
    } finally {
      this.state.syncClosing = false;
    }
  }

  handleModalClosed() {
    if (this.state.syncClosing) return;
    this.state.syncClosing = true;
    try {
      if (typeof this.cart.closeSideCart === "function") {
        this.cart.closeSideCart();
      }
    } finally {
      this.state.syncClosing = false;
    }
  }

  handleDocumentClick(event) {
    const triggerSelectors = [
      "[data-open-cart-recs-modal]",
      "[data-open-cart-recommendations]",
      "[data-open-recommendations]",
      "[data-open-cart-recs]",
      '[data-modal-open="cart-recommendations"]',
      ".openCartRecs",
      ".openCartRecommendations",
    ];

    let trigger = null;
    for (let i = 0; i < triggerSelectors.length; i += 1) {
      const selector = triggerSelectors[i];
      trigger = event.target.closest(selector);
      if (trigger) break;
    }

    if (trigger) {
      event.preventDefault();
      Promise.resolve(this.open()).catch((err) => {
        console.warn("CartRecommendationsModal: failed to open via trigger", err);
      });
    }
  }

  handleResize() {
    const clear = typeof window !== "undefined" ? window.clearTimeout : clearTimeout;
    const schedule = typeof window !== "undefined" ? window.setTimeout : setTimeout;

    if (this.resizeDebounceTimer) {
      clear(this.resizeDebounceTimer);
    }
    this.resizeDebounceTimer = schedule(() => {
      this.resizeDebounceTimer = null;
      if (typeof window === "undefined" || !window.matchMedia) return;
      this.syncModalWithViewport(window.matchMedia("(min-width:1200px)").matches);
    }, 100);
  }

  handleBreakpointChange(event) {
    this.syncModalWithViewport(!!event.matches);
  }

  // Create the modal overlay from a hidden <template> so nothing is visible at page-load
  mountFromTemplate() {
    const existingOverlay =
      this.elements.overlay && document.body.contains(this.elements.overlay)
        ? this.elements.overlay
        : document.querySelector('[data-modal="cart-recommendations"]');
    if (existingOverlay) {
      this.elements.overlay = existingOverlay;
      this.elements.container = this.findModalContainer(existingOverlay);
      return existingOverlay;
    }

    const tpl = document.getElementById("cart-recs-modal-template");
    if (!tpl) return null;

    const root = tpl.content?.firstElementChild;
    if (!root) return null;

    const overlay = root.cloneNode(true);
    // Do not dim page and allow backdrop clicks to close sidecart
    overlay.dataset.modalNoDim = "true";
    document.body.appendChild(overlay);
    this.elements.overlay = overlay;
    this.elements.container = this.findModalContainer(overlay);
    return overlay;
  }

  findModalContainer(overlay, ctrl = null) {
    const root = overlay || this.elements.overlay;
    const controller = ctrl || this.recController || null;
    if (!root) return null;

    const selectors = controller?.selectors || {};
    const containerSelector =
      selectors.cartRecommendationsContainer ||
      "[data-cart-recommendations-container],[side-cart-recommended-container]";
    const sliderSelector =
      selectors.cartRecommendationsSlider ||
      selectors.sliderSelector ||
      "[data-cart-recommendations-slider],[theme-settings-recommendations]";

    return root.querySelector(containerSelector) || root.querySelector(sliderSelector) || null;
  }

  async resolveController() {
    if (this.recController) return this.recController;
    try {
      const ctrl = await this.cart.getRecommendationsController();
      this.recController = ctrl;
      return ctrl;
    } catch (error) {
      console.warn("CartRecommendationsModal: failed to resolve recommendations controller", error);
      return null;
    }
  }

  getRecommendationContext(ctrl) {
    const recommendationsSection =
      ctrl.getRecommendationsSectionElement?.() ||
      document.querySelector(ctrl.selectors.cartRecommendationsSection);
    const sectionId =
      recommendationsSection?.dataset?.sectionId ||
      recommendationsSection?.getAttribute?.("data-section-id") ||
      null;
    const limitAttr =
      recommendationsSection?.dataset?.limit ||
      recommendationsSection?.getAttribute?.("data-limit");
    const parsedLimit = limitAttr ? Number(limitAttr) : NaN;
    const limit = Number.isFinite(parsedLimit) ? parsedLimit : 5;

    const productId = ctrl.getFirstProductId?.() || (this.cart?.items?.[0]?.product_id ?? null);

    return { sectionId, productId, limit };
  }

  getModalSliderElements(root = null) {
    const scope = root || this.elements.overlay || document;
    const sliderSelector =
      this.recController?.selectors?.cartRecommendationsSlider ||
      "[data-cart-recommendations-slider],[theme-settings-recommendations],.cart-recommendations-slider";
    const sliderElement =
      scope.querySelector?.(sliderSelector) ||
      scope.querySelector?.(".cart-recommendations-slider") ||
      scope.querySelector?.("[data-blaze-slider]") ||
      null;
    const nextBtn =
      scope.querySelector?.(".blaze-button-next.cart-rec") ||
      document.querySelector(".blaze-button-next.cart-rec");
    const prevBtn =
      scope.querySelector?.(".blaze-button-prev.cart-rec") ||
      document.querySelector(".blaze-button-prev.cart-rec");

    return { sliderElement, nextBtn, prevBtn };
  }

  bindModalNavigation(root = null) {
    const { sliderElement, nextBtn, prevBtn } = this.getModalSliderElements(root);
    if (!sliderElement) return;

    if (nextBtn) nextBtn.style.display = "";
    if (prevBtn) prevBtn.style.display = "";

    const instance =
      sliderElement.__themeBlazeSlider ||
      sliderElement.__cartRecommendationsslider ||
      sliderElement.slider ||
      null;
    if (!instance) return;

    if (nextBtn) {
      if (nextBtn.__cartRecNextHandler) {
        nextBtn.removeEventListener("click", nextBtn.__cartRecNextHandler);
      }
      const nextHandler = () => {
        try {
          if (typeof instance.next === "function") instance.next();
        } catch (err) {
          console.warn("CartRecommendationsModal: next navigation failed", err);
        }
      };
      nextBtn.__cartRecNextHandler = nextHandler;
      nextBtn.addEventListener("click", nextHandler);
      nextBtn.__cartRecNextBound = true;
    }

    if (prevBtn) {
      if (prevBtn.__cartRecPrevHandler) {
        prevBtn.removeEventListener("click", prevBtn.__cartRecPrevHandler);
      }
      const prevHandler = () => {
        try {
          if (typeof instance.prev === "function") instance.prev();
        } catch (err) {
          console.warn("CartRecommendationsModal: previous navigation failed", err);
        }
      };
      prevBtn.__cartRecPrevHandler = prevHandler;
      prevBtn.addEventListener("click", prevHandler);
      prevBtn.__cartRecPrevBound = true;
    }
  }

  async injectMarkupIntoModal({ ctrl, container, overlay, html }) {
    if (!html || !container) return { handled: false, hasProducts: false };

    const wrapper = document.createElement("div");
    wrapper.innerHTML = html;
    const templateRoot = wrapper.querySelector("#cart-recs-modal-template, template");
    const sourceRoot = templateRoot?.content || wrapper;

    const wantsContainer =
      typeof container.matches === "function"
        ? container.matches(ctrl.selectors.cartRecommendationsContainer)
        : false;
    const replacement =
      (wantsContainer
        ? sourceRoot.querySelector(ctrl.selectors.cartRecommendationsContainer)
        : sourceRoot.querySelector(ctrl.selectors.cartRecommendationsSlider)) ||
      sourceRoot.querySelector(ctrl.selectors.cartRecommendationsContainer) ||
      sourceRoot.querySelector(ctrl.selectors.cartRecommendationsSlider) ||
      sourceRoot.querySelector(".cart-recommendations-slider") ||
      sourceRoot.querySelector("[data-blaze-slider]") ||
      sourceRoot.firstElementChild;

    if (!replacement) {
      return { handled: false, hasProducts: false };
    }

    container.innerHTML = replacement.innerHTML ?? replacement.outerHTML;

    if (typeof ctrl.initRecommendationsSlider === "function") {
      ctrl.initRecommendationsSlider(overlay || container);
    }

    this.bindModalNavigation(overlay || container);

    const hasProducts =
      (replacement.querySelectorAll && replacement.querySelectorAll(".product").length > 0) ||
      (replacement.querySelectorAll && replacement.querySelectorAll("slider-slide").length > 0);

    if (hasProducts) {
      if (ctrl?.state) ctrl.state.hydrated = true;
      window.dispatchEvent(
        new CustomEvent("cart:recommendations-loaded", { detail: { element: container } }),
      );
    }

    return { handled: true, hasProducts };
  }

  modalHasRecommendationSlides(root = null) {
    const scope = root || this.elements.overlay || document;
    const container = this.findModalContainer(scope);
    if (!container) return false;

    const slides = container.querySelectorAll(".blaze-track > *");
    return slides.length > 0;
  }

  async waitForBlazeController(maxMs = 2000) {
    const start = Date.now();
    while (!window.themeBlazeSliderController && Date.now() - start < maxMs) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return window.themeBlazeSliderController || null;
  }

  playEntryAnimation(root = null) {
    const overlay = root || this.elements.overlay;
    if (!overlay) return;

    const panel =
      overlay.querySelector(".modal-panel") || overlay.querySelector(".modal-content");
    if (!panel) return;

    panel.classList.remove("slide-in-active");
    // Force the browser to paint the initial off-screen state before animating in.
    void panel.offsetWidth;

    const activate = () => panel.classList.add("slide-in-active");
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => requestAnimationFrame(activate));
      return;
    }

    activate();
  }

  async finalizeModalSliderAfterOpen(root = null) {
    const ctrl = await this.resolveController();
    await this.waitForBlazeController();

    const { sliderElement } = this.getModalSliderElements(root);
    if (!sliderElement) return;

    if (typeof ctrl?.initRecommendationsSlider === "function") {
      ctrl.initRecommendationsSlider(root || sliderElement.closest('[data-modal="cart-recommendations"]') || document);
    }

    await new Promise((resolve) => {
      const sync = () => {
        const blazeController = window.themeBlazeSliderController;
        if (blazeController) {
          blazeController.refresh(sliderElement);
        }
        sliderElement.classList.remove("blaze-loading");
        resolve();
      };

      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(() => requestAnimationFrame(sync));
        return;
      }

      sync();
    });
  }

  async loadModalRecommendations({ force = false, skipDrawerEnsure = false } = {}) {
    if (force && typeof this.cart.refreshCartData === "function") {
      try {
        await this.cart.refreshCartData({ silent: true });
      } catch (error) {
        console.warn("CartRecommendationsModal: refreshCartData failed", error);
      }
    }

    if (!skipDrawerEnsure) {
      try {
        await this.cart.ensureDrawerContent({
          includeRecommendations: true,
          reason: force ? "recs-modal:reload" : "recs-modal",
        });
      } catch (error) {
        console.warn("CartRecommendationsModal: ensureDrawerContent failed", error);
      }
    }

    const ctrl = await this.resolveController();
    if (!ctrl || (!ctrl.loadRecommendations && !ctrl.fetchRecommendationMarkup)) {
      return;
    }

    if (force && ctrl.state) {
      ctrl.state.hydrated = false;
    }

    const overlay = this.mountFromTemplate();
    const container = this.findModalContainer(overlay, ctrl);
    this.elements.overlay = overlay;
    this.elements.container = container;

    const { sectionId, productId, limit } = this.getRecommendationContext(ctrl);

    if (container && ctrl.fetchRecommendationMarkup && sectionId && productId) {
      try {
        const html = await ctrl.fetchRecommendationMarkup({
          sectionId,
          productId,
          limit,
          force,
        });
        const result = await this.injectMarkupIntoModal({
          ctrl,
          container,
          overlay,
          html,
        });
        if (result.handled) {
          return;
        }
      } catch (error) {
        console.warn("CartRecommendationsModal: failed to inject markup", error);
      }
    }

    try {
      await ctrl.loadRecommendations({ limit, force });
      if (typeof ctrl.initRecommendationsSlider === "function") {
        ctrl.initRecommendationsSlider(overlay || document);
      }
    } catch (error) {
      console.warn("CartRecommendationsModal: fallback loadRecommendations failed", error);
    }
  }

  async ensureRecommendationsLoaded({ skipDrawerEnsure = false } = {}) {
    await this.loadModalRecommendations({ force: false, skipDrawerEnsure });
  }

  async open() {
    const now = Date.now();
    if (now - this.state.lastOpenedAt < this.state.minIntervalMs) return;
    this.state.lastOpenedAt = now;

    // On narrow viewports the sidecart contains the recommendations UI and the
    // modal should not be shown. Respect the theme breakpoint (min-width:1200px).
    if (!window.matchMedia || !window.matchMedia("(min-width:1200px)").matches) {
      return;
    }

    // Ensure the modal exists in DOM and is not visible at load
    const overlay = this.mountFromTemplate();
    const modalContent = overlay ? overlay.querySelector(".modal-content") : null;

    // Detect whether the sidecart/drawer is currently open. If not open, present
    // the modal in a full-width layout to use available screen space.
    const drawer = document.querySelector(this.cart.selectors.cartDrawerContainer);
    const drawerOpen = !!(drawer && drawer.classList && drawer.classList.contains("is-open"));

    if (overlay) {
      // Keep the drawer fully visible; don't dim the background
      overlay.style.background = "transparent";

      if (!drawerOpen) {
        // When drawer isn't open, mark modal content for full-width; the ModalController
        // will apply its own layout, so we later re-apply our override after present.
        if (modalContent) {
          modalContent.classList.add("modal-fullwidth");
          // modalContent.style.maxWidth = "none";
          // modalContent.style.width = "calc(100% - 48px)";
          // modalContent.style.margin = "24px";
        }
      } else {
        // Restore default layout when drawer is open
        if (modalContent) {
          modalContent.classList.remove("modal-fullwidth");
          // modalContent.style.maxWidth = "";
          // modalContent.style.width = "";
          // modalContent.style.margin = "";
        }
      }
    }

    // Cart add flow usually injects recommendations before calling open(); only fetch
    // when the mounted modal does not already contain slider slides.
    if (!this.modalHasRecommendationSlides(overlay)) {
      await this.ensureRecommendationsLoaded({ skipDrawerEnsure: true });
    }

    // Present the modal without slide-in yet — content is ready but panel stays at
    // opacity:0 / off-screen until Blaze is measured and we trigger the animation.
    this.modal.presentModal("cart-recommendations", 0, null, { skipSlideIn: true });
    this.state.isOpen = true;

    // After the ModalController runs its layout logic, force the panel into
    // centered full-width when the drawer is closed (override any left alignment).
    try {
      const active = document.querySelector('[data-modal="cart-recommendations"]');
      const panel = active ? active.firstElementChild : null;
      if (panel && !drawerOpen) {
        panel.classList.add("modal-fullwidth");
        panel.style.maxWidth = "none";
        panel.style.width = "calc(100% - 48px)";
        panel.style.margin = "24px auto";
      }
    } catch (err) {
      console.warn("CartRecommendationsModal: failed to enforce fullwidth layout", err);
    }

    // Init Blaze after the modal is visible so slide widths are measured correctly,
    // then play the slide-in once layout is settled.
    try {
      await this.finalizeModalSliderAfterOpen(overlay);
      this.bindModalNavigation(overlay || document);
    } catch (err) {
      console.warn("CartRecommendationsModal: failed to finalize modal slider", err);
    } finally {
      this.playEntryAnimation(overlay);
    }
  }

  close() {
    try {
      this.modal.hideModal("cart-recommendations");
    } finally {
      this.state.isOpen = false;
    }
  }

  // Listener: refresh recommendations when cart updates while modal is open
  async handleCartUpdated(event) {
    const detail = event?.detail || {};
    const action = detail.action;

    if (action === "add") {
      if (this.state.isOpen) {
        try {
          await this.reloadRecommendations();
        } catch (err) {
          console.warn("CartRecommendationsModal: failed to reload after add", err);
        }
      }
      // cart.js injects recommendations and opens the modal after add completes.
      return;
    }

    if (!this.state.isOpen) return;

    // Always reload recommendations when the modal is open so modal content stays
    // in sync with the side-cart (handles change/remove/clear).
    try {
      await this.reloadRecommendations();
    } catch (err) {
      console.warn("CartRecommendationsModal: failed to reload recommendations", err);
    }
  }

  // Force a re-load into the existing modal without reopening
  async reloadRecommendations() {
    await this.loadModalRecommendations({ force: true, skipDrawerEnsure: true });
    if (!this.state.isOpen) return;

    try {
      await this.finalizeModalSliderAfterOpen(this.elements.overlay);
      this.bindModalNavigation(this.elements.overlay || document);
    } catch (err) {
      console.warn("CartRecommendationsModal: failed to refresh slider after reload", err);
    }
  }
}

// Bootstrap singleton
export const cartRecommendationsModal = new CartRecommendationsModal();
window.CartRecommendationsModal = CartRecommendationsModal;
window.cartRecommendationsModal = cartRecommendationsModal;
