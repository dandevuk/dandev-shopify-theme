import { createBreakpointConfig } from "@theme/slider-config";

function toNumber(value, fallback) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return fallback;
    const parsed = Number.parseFloat(trimmed);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    return value === "true" || value === "1";
  }
  return Boolean(value);
}

export class CartRecommendationsController {
  constructor({ cart = null, selectors = {}, sliderDefaults = null } = {}) {
    this.cart = cart;

    this.selectors = {
      cartRecommendationsSection:
        "[data-cart-recommendations-section],[side-cart-recommendations-section]",
      cartRecommendationsContainer:
        "[data-cart-recommendations-container],[side-cart-recommended-container]",
      cartRecommendationsSlider:
        "[data-cart-recommendations-slider],[theme-settings-recommendations],.cart-recommendations-slider",
      sliderSelector: ".side-cart-recommendations-slider, .cart-recommendations-slider",
    };

    this.selectors = { ...this.selectors, ...(selectors || {}) };

    this.state = {
      hydrated: false,
    };

    this.sliderDefaults = sliderDefaults || {
      all: {
        slidesToShow: 2,
        slideGap: "16px",
      },
      "(min-width: 1500px)": {
        slidesToShow: 4,
        slideGap: "30px",
      },
    };

    this.sliderNavigationDefaults = {
      nextEl: ".blaze-button-next.cart-rec",
      prevEl: ".blaze-button-prev.cart-rec",
    };

    this.sliderLazyDefaults = {};

    this.fetchCache = new Map();
  }

  setCart(cartInstance) {
    this.cart = cartInstance;
  }

  getRoot() {
    // Prefer Cart instance root if available, fall back to Shopify routes or origin
    const cartRoot = this.cart?.root;
    if (cartRoot) return cartRoot;

    const shopRoot = window.Shopify?.routes?.root || "/";
    try {
      return new URL(shopRoot, window.location.origin).toString();
    } catch (e) {
      return `${window.location.origin}${shopRoot.startsWith("/") ? "" : "/"}${shopRoot}`;
    }
  }

  getRecommendationsSectionElement() {
    const nodes = document.querySelectorAll(this.selectors.cartRecommendationsSection);
    for (const node of nodes) {
      if (!node.closest?.('[data-modal="cart-recommendations"]')) {
        return node;
      }
    }
    return nodes[0] || null;
  }

  getFirstProductId() {
    // Prefer Cart instance state
    const items =
      this.cart?.cart?.items ||
      this.cart?.items ||
      (typeof this.cart === "object" && Array.isArray(this.cart?.items) && this.cart?.items) ||
      null;

    const first = items?.[0];
    let productId = first?.product_id ?? first?.product?.id ?? first?.variant?.product_id ?? null;

    // DOM fallback: when cart state hasn't been refreshed yet but the drawer is rendered
    if (!productId) {
      const domLine =
        document.querySelector("[data-cart-drawer] [data-cart-line][data-product-id]") ||
        document.querySelector("[data-cart-drawer] .item[data-product-id]") ||
        document.querySelector("[data-cart-items] [data-cart-line][data-product-id]") ||
        document.querySelector("[data-cart-items] .item[data-product-id]");
      const attr = domLine?.getAttribute?.("data-product-id");
      if (attr) {
        const n = Number(attr);
        productId = Number.isNaN(n) ? attr : n;
      }
    }

    return productId || null;
  }

  // Prefer injecting into an active modal if present; else fall back to first on page
  getPreferredTarget() {
    const activeModal = document.querySelector('[data-modal="cart-recommendations"]');
    if (activeModal) {
      const scoped =
        activeModal.querySelector(this.selectors.cartRecommendationsContainer) ||
        activeModal.querySelector(this.selectors.cartRecommendationsSlider);
      if (scoped) {
        return { container: scoped, root: activeModal };
      }
    }

    const container =
      document.querySelector(this.selectors.cartRecommendationsContainer) ||
      document.querySelector(this.selectors.cartRecommendationsSlider);

    return { container, root: document };
  }

  getRecommendationCacheKey(sectionId, productId, limit) {
    const sid = sectionId || "section";
    const pid = productId || "product";
    const lim = typeof limit === "number" ? limit : "limit";
    return `${sid}::${pid}::${lim}`;
  }

  clearRecommendationCache(key = null) {
    if (key) {
      this.fetchCache.delete(key);
      return;
    }
    this.fetchCache.clear();
  }

  parseSliderConfig(element) {
    if (!element) return {};

    const config = {};

    const jsonConfig = element.dataset?.blazeConfig || element.dataset?.sliderConfig;
    if (jsonConfig) {
      try {
        const parsed = JSON.parse(jsonConfig);
        Object.assign(config, parsed || {});
      } catch (err) {
        console.warn("CartRecommendations: failed to parse slider config JSON", err);
      }
    }

    const attrSlides =
      element.dataset?.sliderMobile || element.getAttribute?.("slides-per-view");
    if (attrSlides) {
      const n = Number(attrSlides);
      if (!Number.isNaN(n)) {
        config.all = config.all || {};
        config.all.slidesToShow = n;
      }
    }

    const attrSpace =
      element.dataset?.sliderGapMobile || element.getAttribute?.("space-between");
    if (attrSpace) {
      const n = Number(attrSpace);
      if (!Number.isNaN(n)) {
        config.all = config.all || {};
        config.all.slideGap = `${n}px`;
      }
    }

    const attrBreakpoints = element.getAttribute?.("breakpoints");
    if (attrBreakpoints) {
      try {
        const parsed = JSON.parse(attrBreakpoints);
        if (parsed && typeof parsed === "object") {
          config.breakpoints = { ...(config.breakpoints || {}), ...parsed };
        }
      } catch (err) {
        console.warn("CartRecommendations: failed to parse slider breakpoints", err);
      }
    }

    if (config.breakpoints) {
      const fallback = {
        ...(config.all || {}),
      };

      Object.entries(config.breakpoints).forEach(([key, value]) => {
        const breakpoint = Number(key);
        if (!Number.isFinite(breakpoint)) return;
        const slidesToShow = Number(value?.slidesToShow ?? value?.slidesPerView);
        const rawGap = value?.slideGap ?? value?.spaceBetween;
        const gap = Number(rawGap);
        config[`(min-width: ${breakpoint}px)`] = {
          ...fallback,
          ...(Number.isFinite(slidesToShow) ? { slidesToShow } : {}),
          ...(Number.isFinite(gap) ? { slideGap: `${gap}px` } : {}),
        };
      });

      delete config.breakpoints;
    }

    if (!config.all) {
      config.all = {
        slidesToShow: 2,
        slideGap: "16px",
      };
    }

    return config;
  }

  mergeSliderOptions(baseOptions = {}, overrideOptions = {}) {
    return {
      ...baseOptions,
      ...overrideOptions,
      all: {
        ...(baseOptions.all || {}),
        ...(overrideOptions.all || {}),
      },
    };
  }

  buildSliderOptions(element) {
    const dataset = element?.dataset || {};

    if (
      dataset.sliderMobile ||
      dataset.sliderTablet ||
      dataset.sliderDesktop ||
      dataset.sliderWide
    ) {
      const mobileSlides = toNumber(dataset.sliderMobile, 2);
      const tabletSlides = toNumber(dataset.sliderTablet, mobileSlides);
      const desktopSlides = toNumber(dataset.sliderDesktop, tabletSlides);
      const wideSlides = toNumber(dataset.sliderWide, desktopSlides);

      const mobileGap = toNumber(dataset.sliderGapMobile, 16);
      const tabletGap = toNumber(dataset.sliderGapTablet, mobileGap);
      const desktopGap = toNumber(dataset.sliderGapDesktop, tabletGap);
      const wideGap = toNumber(dataset.sliderGapWide, desktopGap);

      return createBreakpointConfig({
        mobileSlides,
        tabletSlides,
        desktopSlides,
        wideSlides,
        mobileGap,
        tabletGap,
        desktopGap,
        wideGap,
        loop: toBoolean(dataset.sliderLoop, false),
        enablePagination: toBoolean(dataset.sliderPagination, false),
        enableAutoplay: toBoolean(dataset.sliderAutoplay, false),
        autoplayInterval: toNumber(dataset.sliderAutoplayInterval, 3000),
      });
    }

    const config = this.parseSliderConfig(element);
    return this.mergeSliderOptions(this.sliderDefaults, config);
  }

  resolveBlazeController() {
    return window.themeBlazeSliderController || null;
  }

  async injectRecommendationsMarkup(html) {
    if (!html) return null;

    const { container: target, root } = this.getPreferredTarget();
    if (!target) return null;

    const wrapper = document.createElement("div");
    wrapper.innerHTML = html;

    const wantsContainer = target?.matches?.(this.selectors.cartRecommendationsContainer);
    const replacement =
      (wantsContainer
        ? wrapper.querySelector(this.selectors.cartRecommendationsContainer)
        : wrapper.querySelector(this.selectors.cartRecommendationsSlider)) ||
      wrapper.querySelector(this.selectors.cartRecommendationsContainer) ||
      wrapper.querySelector(this.selectors.cartRecommendationsSlider) ||
      wrapper.firstElementChild;

    if (!replacement) {
      console.warn("CartRecommendations: no replacement subtree found in markup");
      return null;
    }

    const hasProducts =
      replacement.querySelectorAll(".product").length > 0 ||
      replacement.querySelectorAll(".blaze-track > *").length > 0;

    target.innerHTML = replacement.innerHTML ?? replacement.outerHTML;
    this.initRecommendationsSlider(root);

    if (hasProducts) {
      this.state.hydrated = true;
      window.dispatchEvent(
        new CustomEvent("cart:recommendations-loaded", { detail: { element: target } }),
      );
    }

    return { element: target, root, hasProducts };
  }

  async fetchSectionHTML(handle = "cart-recommendations") {
    try {
      const url = new URL("cart", this.getRoot());
      url.searchParams.set("sections", handle);

      const response = await fetch(url.toString(), {
        method: "GET",
        credentials: "same-origin",
        headers: { "X-Requested-With": "XMLHttpRequest", Accept: "application/json" },
      });

      const data = await response.json().catch(() => null);
      if (!data) return null;

      return data[handle] || data[handle.replace(/-/g, "_")] || null;
    } catch (error) {
      console.warn(`CartRecommendations: failed to fetch section "${handle}"`, error);
      return null;
    }
  }

  async hydrateFromSection(handle = "cart-recommendations") {
    const html = await this.fetchSectionHTML(handle);
    if (!html) return null;
    const result = await this.injectRecommendationsMarkup(html);
    return result?.element || null;
  }

  async fetchRecommendationMarkup({ sectionId, productId, limit, force = false }) {
    const cacheKey = this.getRecommendationCacheKey(sectionId, productId, limit);
    if (!force && this.fetchCache.has(cacheKey)) {
      return this.fetchCache.get(cacheKey);
    }

    const request = (async () => {
      try {
        const url = new URL("recommendations/products", this.getRoot());
        url.searchParams.set("section_id", sectionId);
        url.searchParams.set("product_id", String(productId));
        url.searchParams.set("limit", String(limit));

        const response = await fetch(url.toString(), {
          method: "GET",
          credentials: "same-origin",
        });

        if (!response.ok) {
          console.warn(
            "CartRecommendations: recommendations endpoint returned non-OK status",
            response.status,
          );
          return null;
        }

        return await response.text();
      } catch (error) {
        console.warn("CartRecommendations: failed to load recommendations markup", error);
        return null;
      }
    })();

    this.fetchCache.set(cacheKey, request);

    const result = await request;
    if (result === null) {
      this.fetchCache.delete(cacheKey);
    }
    return result;
  }

  async loadRecommendations({ limit = 5, force = false } = {}) {
    if (!force && this.state.hydrated) return null;
    if (force) {
      this.state.hydrated = false;
    }

    const recommendationsSection = this.getRecommendationsSectionElement();
    const productId = this.getFirstProductId();

    if (!recommendationsSection || !productId) {
      return this.hydrateFromSection();
    }

    const sectionId =
      recommendationsSection.dataset?.sectionId ||
      recommendationsSection.getAttribute("data-section-id");
    const max = recommendationsSection.dataset?.limit ?? limit;

    if (!sectionId) {
      return this.hydrateFromSection();
    }

    const html = await this.fetchRecommendationMarkup({
      sectionId,
      productId,
      limit: max,
      force,
    });

    if (!html) {
      return this.hydrateFromSection();
    }

    const injected = await this.injectRecommendationsMarkup(html);
    if (!injected || !injected.hasProducts) {
      return this.hydrateFromSection();
    }

    return injected.element || null;
  }

  initRecommendationsSlider(root = document) {
    const selector = this.selectors.cartRecommendationsSlider || this.selectors.sliderSelector;
    const scope = root && typeof root.querySelector === "function" ? root : document;
    const sliderElement =
      scope.querySelector(selector) ||
      scope.querySelector(this.selectors.sliderSelector) ||
      scope.querySelector(".cart-recommendations [data-blaze-slider]");
    if (!sliderElement) return null;

    const blazeController = this.resolveBlazeController();
    if (!blazeController) return null;

    const options = this.buildSliderOptions(sliderElement);
    sliderElement.dataset.blazeConfig = JSON.stringify(options);

    const instance = blazeController.refresh(sliderElement);
    if (instance) {
      sliderElement.classList.remove("blaze-loading");
    }

    return instance;
  }
}
export const cartRecommendations = new CartRecommendationsController();

export default cartRecommendations;
