import { ModalController } from "@theme/modal-controller";

const getOrCreateModalController = () => {
  if (window.__quickfireModalController) {
    return window.__quickfireModalController;
  }
  const instance = new ModalController();
  window.__quickfireModalController = instance;
  return instance;
};

class LightboxInstance {
  constructor(modalEl, modalController, scope = document) {
    this.modalEl = modalEl;
    this.modalController = modalController;
    this.scope = scope;
    this.modalId = modalEl?.dataset?.modal || null;
    if (!this.modalId) return;

    this.sliderEl = modalEl.querySelector(".lightbox-slider[data-blaze-slider]");

    const queryRoot = scope === document ? document : scope;
    const triggers = Array.from(
      queryRoot.querySelectorAll(
        `[data-lightbox-trigger][data-modal-trigger="${this.modalId}"]`,
      ),
    );
    this.triggers = triggers.filter((trigger) => trigger.dataset.lightboxBound !== "true");

    if (!this.triggers.length) return;

    this.scrollLocked = false;
    this.isActive = false;
    this.openCheckTimer = null;
    this.handleTrigger = this.handleTrigger.bind(this);
    this.handleModalClosed = this.handleModalClosed.bind(this);
    this.handleKeydown = this.handleKeydown.bind(this);

    this.triggers.forEach((trigger) => {
      trigger.addEventListener("click", this.handleTrigger);
      trigger.dataset.lightboxBound = "true";
    });

    if (modalEl.dataset.lightboxBound !== "true") {
      window.addEventListener(`${this.modalId}-modal-closed`, this.handleModalClosed);
      modalEl.dataset.lightboxBound = "true";
    }
  }

  handleTrigger(event) {
    const trigger = event.currentTarget;
    const lightboxIndex = this.resolveLightboxIndex(trigger);

    if (this.sliderEl) {
      this.sliderEl.dataset.sliderInitial = String(lightboxIndex);
    }

    this.lockScroll();

    if (this.modalEl) {
      window.requestAnimationFrame(() => {
        this.modalEl.style.removeProperty("background");
        const panel = this.modalEl.querySelector("[data-modal-panel]");
        if (panel) {
          panel.style.maxWidth = "none";
          panel.style.margin = "0";
        }
      });
    }

    const showClass = this.modalController?.showClass || "active";
    if (this.openCheckTimer) {
      window.clearTimeout(this.openCheckTimer);
    }
    this.openCheckTimer = window.setTimeout(() => {
      if (!this.modalEl?.classList.contains(showClass)) {
        this.unlockScroll();
      }
      this.openCheckTimer = null;
    }, 400);

    this.initslider().then(() => {
      const syncSlide = () => {
        const controller = window.themeBlazeSliderController;
        const slider =
          controller?.syncToSlideIndex?.(this.sliderEl, lightboxIndex) || this.sliderEl?.slider;
        if (slider?.zoom && typeof slider.zoom.out === "function") {
          try {
            slider.zoom.out();
          } catch { }
        }
        return slider;
      };

      requestAnimationFrame(() => {
        requestAnimationFrame(syncSlide);
      });
      this.isActive = true;
      document.addEventListener("keydown", this.handleKeydown);
      const closeBtn = this.modalEl?.querySelector(".product-lightbox-modal__close");
      if (closeBtn && typeof closeBtn.focus === "function") {
        setTimeout(() => closeBtn.focus(), 150);
      }
    });
  }

  resolveLightboxIndex(trigger) {
    const slideIndexAttr = trigger?.getAttribute("data-slide-index");
    if (slideIndexAttr !== null && slideIndexAttr !== "") {
      const mediaIndex = parseInt(slideIndexAttr, 10);
      if (Number.isFinite(mediaIndex)) {
        return this.mediaIndexToLightboxIndex(mediaIndex);
      }
    }

    const mainSelector = trigger?.getAttribute("data-lightbox-main-slider");
    const mediaIndex = this.resolveMainGalleryMediaIndex(mainSelector, trigger);
    return this.mediaIndexToLightboxIndex(mediaIndex);
  }

  resolveMainGalleryMediaIndex(selector, trigger) {
    const galleryContainer =
      trigger?.closest?.("[gallery-container]") || document.querySelector("[gallery-container]");
    const mainSlider =
      (selector && document.querySelector(selector)) ||
      galleryContainer?.querySelector("[main-gallery-slider]");

    if (!mainSlider) return 0;

    const blazeIndex = mainSlider.slider?.activeIndex ?? mainSlider.slider?.realIndex;
    if (typeof blazeIndex === "number" && Number.isFinite(blazeIndex)) {
      return blazeIndex;
    }

    const activeThumbSlide = mainSlider.querySelector(".main-slider-slide.blaze-thumb-active");
    if (activeThumbSlide?.dataset?.index !== undefined) {
      return parseInt(activeThumbSlide.dataset.index, 10);
    }

    const activeVariantSlide = mainSlider.querySelector(
      ".main-slider-slide .variant-image-wrapper.active",
    );
    if (activeVariantSlide) {
      const slide = activeVariantSlide.closest(".main-slider-slide");
      if (slide?.dataset?.index !== undefined) {
        return parseInt(slide.dataset.index, 10);
      }
    }

    const visibleSlide = mainSlider.querySelector(".main-slider-slide.first-image");
    if (visibleSlide?.dataset?.index !== undefined) {
      return parseInt(visibleSlide.dataset.index, 10);
    }

    const initial = mainSlider.dataset?.sliderInitial;
    if (initial !== undefined && initial !== "") {
      return parseInt(initial, 10);
    }

    return 0;
  }

  mediaIndexToLightboxIndex(mediaIndex) {
    if (!Number.isFinite(mediaIndex)) return 0;

    const slides = this.modalEl?.querySelectorAll(".lightbox-slider-slide[data-lightbox-index]");
    if (!slides?.length) return Math.max(0, mediaIndex);

    for (let i = 0; i < slides.length; i += 1) {
      if (Number(slides[i].dataset.lightboxIndex) === mediaIndex) {
        return i;
      }
    }

    return Math.max(0, Math.min(mediaIndex, slides.length - 1));
  }

  async initslider() {
    if (!this.sliderEl) return null;

    const controller = window.themeBlazeSliderController;
    if (this.sliderEl.slider) {
      const blazeInstance = controller?.instances?.get?.(this.sliderEl);
      if (blazeInstance && controller?.attachNavigation) {
        controller.attachNavigation(this.sliderEl, blazeInstance);
      }
      return this.sliderEl.slider;
    }

    if (controller?.refresh) {
      controller.refresh(this.sliderEl);
    } else if (controller?.init) {
      controller.init(this.sliderEl);
    }

    let attempts = 0;
    while (!this.sliderEl.slider && attempts < 10) {
      // wait for async slider init
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => requestAnimationFrame(resolve));
      attempts += 1;
    }

    if (this.sliderEl.slider && typeof this.sliderEl.slider.update === "function") {
      try {
        this.sliderEl.slider.update();
      } catch { }
    }

    return this.sliderEl.slider || null;
  }

  handleModalClosed() {
    this.unlockScroll();
    if (this.openCheckTimer) {
      window.clearTimeout(this.openCheckTimer);
      this.openCheckTimer = null;
    }
    if (!this.isActive) return;
    this.isActive = false;
    document.removeEventListener("keydown", this.handleKeydown);
  }

  handleKeydown(event) {
    if (event.key !== "Escape" || !this.isActive) return;
    event.preventDefault();
    if (this.modalId) {
      this.modalController.hideModal(this.modalId);
    }
  }

  lockScroll() {
    if (this.scrollLocked) return;
    this.scrollLocked = true;
    this.previousOverflowHtml = document.documentElement.style.overflow;
    this.previousOverflowBody = document.body.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
  }

  unlockScroll() {
    if (!this.scrollLocked) return;
    if (this.openCheckTimer) {
      window.clearTimeout(this.openCheckTimer);
      this.openCheckTimer = null;
    }
    document.documentElement.style.overflow = this.previousOverflowHtml || "";
    document.body.style.overflow = this.previousOverflowBody || "";
    this.scrollLocked = false;
  }
}

class LightboxController {
  constructor(root = document) {
    this.root = root;
    this.modalController = getOrCreateModalController();
    this.instances = [];
    this.mount();
  }

  mount() {
    const scope = this.root === document ? document : this.root;
    const modals = Array.from(scope.querySelectorAll("[data-lightbox-modal]"));
    if (!modals.length) return;
    modals.forEach((modal) => {
      const instance = new LightboxInstance(modal, this.modalController, scope);
      if (instance?.triggers?.length) {
        this.instances.push(instance);
      }
    });
  }
}

export function bootstrapLightbox(root = document) {
  if (!root) return window.__quickfireLightbox;
  if (!window.__quickfireLightbox) {
    window.__quickfireLightbox = new LightboxController(root);
  } else {
    window.__quickfireLightbox.root = root;
    window.__quickfireLightbox.mount();
  }
  return window.__quickfireLightbox;
}

document.addEventListener("shopify:section:load", (event) => {
  bootstrapLightbox(event?.target || document);
});

export { LightboxController };
