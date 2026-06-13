import { lockScroll, unlockScroll } from "@theme/scroll-lock";

export class ProductQuickView extends HTMLElement {
  constructor() {
    super();
    this.product = null;
    this.productId = null;
    this.quickViewModal = null;
    this.abortController = null;
    this.loaderEl = null;

    this.handleClick = this.handleClick.bind(this);
  }

  connectedCallback() {
    this.product = this.closest("product-card");
    this.productId = this.product?.getAttribute("data-product-id") || null;

    this.addEventListener("click", this.handleClick);
  }

  disconnectedCallback() {
    this.removeEventListener("click", this.handleClick);
    this.abortPendingRequest();
  }

  abortPendingRequest() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.hideLoader();
  }

  showLoader() {
    const iconEl = this.querySelector("[icon]");
    const svg = this.querySelector("[quick-shop-icon]");

    if (!iconEl || !svg) return;

    if (this.loaderEl) {
      this.loaderEl.remove();
      this.loaderEl = null;
    }

    const loader = document.createElement("div");
    loader.className = "quickview-loader";
    loader.innerHTML = `
      <svg version="1.1" id="loader-1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px"
        width="12px" height="13px" viewBox="0 0 50 50" xml:space="preserve">
        <path fill="currentColor" d="M43.935,25.145c0-10.318-8.364-18.683-18.683-18.683c-10.318,0-18.683,8.365-18.683,18.683h4.068c0-8.071,6.543-14.615,14.615-14.615c8.072,0,14.615,6.543,14.615,14.615H43.935z">
          <animateTransform attributeType="xml"
            attributeName="transform"
            type="rotate"
            from="0 25 25"
            to="360 25 25"
            dur="0.6s"
            repeatCount="indefinite"/>
        </path>
      </svg>
    `;

    svg.style.display = "none";
    iconEl.appendChild(loader);
    this.loaderEl = loader;
  }

  hideLoader() {
    const svg = this.querySelector("[quick-shop-icon]");

    if (svg) {
      svg.style.display = "";
    }

    if (this.loaderEl) {
      this.loaderEl.remove();
      this.loaderEl = null;
    }
  }

  initializeQuickViewForm() {
    if (!this.quickViewModal) return;

    const wrapper = this.quickViewModal.querySelector("[quickview-product-json]");
    if (!wrapper) return;

    const productJSON = wrapper.getAttribute("quickview-product-json");
    const hasDefaultVariant = wrapper.getAttribute("data-has-default-variant") === "true";

    if (hasDefaultVariant || !productJSON) return;

    try {
      JSON.parse(productJSON);
      // If product form enhancements are required, initialise them here.
      // new ProductFormVariantSelect(productData, 'quickview', false);
    } catch (error) {
      console.warn("ProductQuickView: unable to parse product JSON", error);
    }
  }

  async handleClick(event) {
    event.preventDefault();
    event.stopPropagation();

    const productCard = this.product || this.closest("product-card");
    if (!productCard) {
      console.warn("ProductQuickView: parent product-card not found");
      return;
    }

    const handle = productCard.getAttribute("data-product-handle");
    const variantId = productCard.getAttribute("data-variant-id");

    this.quickViewModal = document.querySelector("quickview-modal");
    if (!handle || !this.quickViewModal) return;

    this.abortPendingRequest();
    this.showLoader();

    let url = `${window.Shopify.routes.root}products/${handle}?section_id=quickview`;
    if (variantId) {
      url += `&variant=${variantId}`;
    }

    const controller = new AbortController();
    this.abortController = controller;

    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      const html = await response.text();
      if (controller.signal.aborted) return;

      const { initMainProductGallery, refreshMainProductGallery } =
        await import("@theme/main-product");

      const htmlDocument = new DOMParser().parseFromString(html, "text/html");
      this.quickViewModal.innerHTML = htmlDocument.documentElement.innerHTML;

      this.initializeQuickViewForm();

      const mainProduct = this.quickViewModal.querySelector("main-product");

      window.setTimeout(async () => {
        if (controller.signal.aborted) {
          return;
        }

        this.quickViewModal.setAttribute("open", "");
        this.lockBodyScroll();
        this.hideLoader();

        if (!mainProduct) {
          return;
        }

        await new Promise((resolve) => requestAnimationFrame(resolve));
        await new Promise((resolve) => requestAnimationFrame(resolve));
        await initMainProductGallery(mainProduct);

        window.setTimeout(() => {
          if (!controller.signal.aborted) {
            refreshMainProductGallery(mainProduct);
          }
        }, 350);
      }, 50);
    } catch (error) {
      if (error.name !== "AbortError") {
        console.error("ProductQuickView: failed to load quick view", error);
        this.hideLoader();
      }
    } finally {
      if (this.abortController === controller) {
        this.abortController = null;
        if (controller.signal.aborted) {
          this.hideLoader();
        }
      }
    }
  }

  lockBodyScroll() {
    lockScroll("quickview");
  }

  static unlockBodyScroll() {
    unlockScroll("quickview");
  }
}

customElements.define("product-quick-view", ProductQuickView);

class QuickViewModal extends HTMLElement {
  constructor() {
    super();
    this.handleOutsideClick = this.handleOutsideClick.bind(this);
  }

  connectedCallback() {
    // Add click listener when modal is opened
    this.addEventListener("click", this.handleOutsideClick);
  }

  disconnectedCallback() {
    // Remove click listener when modal is removed
    this.removeEventListener("click", this.handleOutsideClick);
  }

  handleOutsideClick(event) {
    // Only close if the modal is open
    if (!this.hasAttribute("open")) return;

    // Check if the click was outside the quick-view-inner element
    const quickViewInner = this.querySelector("quick-view-inner");
    if (quickViewInner && !quickViewInner.contains(event.target)) {
      this.closeModal();
    }
  }

  closeModal() {
    this.removeAttribute("open");
    ProductQuickView.unlockBodyScroll();

    window.setTimeout(() => {
      this.innerHTML = "";
    }, 300);
  }
}

customElements.define("quickview-modal", QuickViewModal);

class QuickViewInner extends HTMLElement {
  constructor() {
    super();
    this.closeButton = this.querySelector("[close-quick-view]");
    this.handleClose = this.handleClose.bind(this);
  }

  connectedCallback() {
    if (this.closeButton) {
      this.closeButton.addEventListener("click", this.handleClose);
    }
  }

  disconnectedCallback() {
    if (this.closeButton) {
      this.closeButton.removeEventListener("click", this.handleClose);
    }
  }

  handleClose() {
    this.closeModal();
  }

  closeModal() {
    const quickviewModal = this.closest("quickview-modal");
    if (!quickviewModal) return;

    quickviewModal.removeAttribute("open");
    ProductQuickView.unlockBodyScroll();

    window.setTimeout(() => {
      quickviewModal.innerHTML = "";
    }, 300);
  }
}

customElements.define("quick-view-inner", QuickViewInner);
