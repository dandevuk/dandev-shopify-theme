const MOBILE_BREAKPOINT = 767;

const instances = new Map();

class ProductGalleryController {
  constructor(sliderElement) {
    this.sliderElement = sliderElement;
    this.resizeTimer = null;
    this.handleResize = this.handleResize.bind(this);
    this.init();
  }

  init() {
    if (!this.sliderElement) return;

    this.sliderElement.dataset.productGalleryInitialized = "true";
    this.update();

    if (typeof window !== "undefined") {
      window.addEventListener("resize", this.handleResize, { passive: true });
    }
  }

  shouldEnableSlider() {
    if (typeof window === "undefined") return false;
    return window.innerWidth <= MOBILE_BREAKPOINT;
  }

  applyInitialSlide() {
    window.themeBlazeSliderController?.syncToInitialSlide?.(this.sliderElement);
  }

  update() {
    this.toggleSlider(this.shouldEnableSlider());
  }

  toggleSlider(shouldEnable) {
    if (!this.sliderElement) return;

    const controller = window.themeBlazeSliderController;
    if (!controller) return;

    if (shouldEnable) {
      this.sliderElement.classList.remove("desktop");
      this.sliderElement.dataset.sliderInitialized = "true";
      controller.refresh?.(this.sliderElement);
      requestAnimationFrame(() => this.applyInitialSlide());
      return;
    }

    this.sliderElement.classList.add("desktop");
    this.sliderElement.dataset.sliderInitialized = "false";
    controller.destroy?.(this.sliderElement);
  }

  handleResize() {
    if (!this.sliderElement?.isConnected) {
      this.destroy();
      return;
    }

    const clear = typeof window !== "undefined" ? window.clearTimeout : clearTimeout;
    const schedule = typeof window !== "undefined" ? window.setTimeout : setTimeout;

    if (this.resizeTimer) {
      clear(this.resizeTimer);
    }

    this.resizeTimer = schedule(() => {
      this.resizeTimer = null;
      this.update();
    }, 120);
  }

  destroy() {
    const clear = typeof window !== "undefined" ? window.clearTimeout : clearTimeout;
    if (this.resizeTimer) {
      clear(this.resizeTimer);
      this.resizeTimer = null;
    }

    if (typeof window !== "undefined") {
      window.removeEventListener("resize", this.handleResize);
    }

    if (this.sliderElement) {
      window.themeBlazeSliderController?.destroy?.(this.sliderElement);
      this.sliderElement.classList.add("desktop");
      this.sliderElement.dataset.sliderInitialized = "false";
      delete this.sliderElement.dataset.productGalleryInitialized;
      instances.delete(this.sliderElement);
    }
  }
}

function findGallerySliders(root = document) {
  if (!root || typeof root.querySelectorAll !== "function") return [];
  return Array.from(root.querySelectorAll("[main-gallery] .main-slider[data-blaze-slider]"));
}

function initGalleries(root = document) {
  const sliders = findGallerySliders(root);
  sliders.forEach((slider) => {
    if (!slider) return;

    const existing = instances.get(slider);
    if (existing) {
      existing.update();
      return;
    }

    const instance = new ProductGalleryController(slider);
    instances.set(slider, instance);
  });
}

function teardownGalleries(root = document) {
  for (const [slider, instance] of Array.from(instances.entries())) {
    if (!slider.isConnected || root.contains(slider)) {
      instance.destroy();
    }
  }
}

function onDomReady(callback) {
  if (typeof document === "undefined") return;
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", callback, { once: true });
  } else {
    callback();
  }
}

onDomReady(() => initGalleries(document));

if (typeof document !== "undefined") {
  document.addEventListener("shopify:section:load", (event) => {
    initGalleries(event?.target || document);
  });

  document.addEventListener("shopify:section:unload", (event) => {
    teardownGalleries(event?.target || document);
  });
}

if (typeof window !== "undefined") {
  window.QF = window.QF || {};
  window.QF.productGallery = {
    init: initGalleries,
    destroy: teardownGalleries,
    instances,
  };
}
