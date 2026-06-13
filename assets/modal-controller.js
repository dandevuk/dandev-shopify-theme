/*
  To use in another JS file
      import { ModalController } from '@theme/modal-controller';
      const modalController = new ModalController();

  To use inline
      <script>
          const mc = new window.ModalController();
      </script>
*/

import { lockScroll, unlockScroll } from "@theme/scroll-lock";

export class ModalController {
  constructor(options = {}) {
    this.triggerAttr = options.triggerAttr || "data-modal-trigger";
    this.showClass = options.showClass || "active";
    this.activeModal = null;
    this._resizeHandler = null;
    this.activeLockId = null;

    this.handleDocumentClick = this.handleDocumentClick.bind(this);

    if (typeof document !== "undefined") {
      document.addEventListener("click", this.handleDocumentClick);
    }
  }

  destroy() {
    if (typeof document !== "undefined") {
      document.removeEventListener("click", this.handleDocumentClick);
    }
    this.removeResizeListener();
    if (this.activeLockId) {
      unlockScroll(this.activeLockId);
      this.activeLockId = null;
    }
  }

  handleDocumentClick(event) {
    const trigger = event.target.closest(`[${this.triggerAttr}]`);
    if (trigger) {
      event.preventDefault();
      const triggerId = trigger.getAttribute(this.triggerAttr);
      if (triggerId) {
        this.presentModal(triggerId);
      }
      return;
    }

    const closer = event.target.closest("[data-modal-close]");
    if (closer) {
      event.preventDefault();
      const closeId = closer.getAttribute("data-modal-close");
      if (closeId) {
        this.hideModal(closeId);
      }
      return;
    }

    // Check for click outside modal-panel (on overlay background)
    if (this.activeModal && this.activeModal.classList.contains(this.showClass)) {
      const modalOverlay = event.target.closest(".modal-overlay");
      const modalPanel = event.target.closest(".modal-panel");

      // If clicked on overlay but not on panel, close the modal
      if (modalOverlay && !modalPanel) {
        event.preventDefault();
        const modalId = modalOverlay.getAttribute("data-modal");
        if (modalId) {
          this.hideModal(modalId);
        }
      }
    }
  }

  ensureOverlayClasses(modal, { noDim }) {
    modal.classList.add("modal-overlay");
    modal.classList.toggle("modal-overlay--no-dim", !!noDim);
    modal.classList.add("modal-overlay--visible");
    modal.removeAttribute("hidden");
    modal.style.removeProperty("display");
  }

  ensurePanel(modal) {
    if (!modal) return null;

    let panel = modal.querySelector("[data-modal-panel]");
    if (!panel) {
      panel = modal.querySelector(".modal-panel");
    }
    if (!panel) {
      panel = modal.firstElementChild;
    }

    panel?.classList.add("modal-panel");
    return panel;
  }

  removeResizeListener() {
    if (this._resizeHandler && typeof window !== "undefined") {
      window.removeEventListener("resize", this._resizeHandler);
      this._resizeHandler = null;
    }
  }

  applyResponsiveLayout(panel) {
    if (typeof window === "undefined" || !panel) return;

    const drawerContainer = document.querySelector("[data-cart-drawer]");
    const drawerPanel =
      (drawerContainer && drawerContainer.querySelector(".cart-drawer-panel")) ||
      (drawerContainer && drawerContainer);
    const gutter = 37;

    const drawerOpen = !!(
      drawerContainer &&
      drawerContainer.classList &&
      drawerContainer.classList.contains("is-open")
    );
    const drawerWidth = drawerOpen ? drawerPanel?.offsetWidth || 0 : 0;

    // if (drawerWidth > 0) {
      // const maxWidth = Math.max(360, window.innerWidth - drawerWidth - gutter * 2);
      // panel.style.maxWidth = "2200px";
      // panel.style.margin = `54px ${drawerWidth + gutter * 2}px 15vh ${gutter}px`;
    // } else {
      // panel.style.maxWidth = "";
      // panel.style.margin = "";
    // }
  }

  lazyLoadImages(modal) {
    const images = modal.querySelectorAll("img[data-src]");
    images.forEach((img) => {
      if (!img.dataset?.src) return;
      if (!img.src) {
        img.src = img.dataset.src;
      }
    });
  }

  presentModal(id, timeout = 0, onConfirmCallback, options = {}) {
    const { skipSlideIn = false } = options;
    const modal = document.querySelector(`[data-modal="${id}"]`);
    if (!modal) {
      console.error(`Modal with id '${id}' doesn't exist`);
      return;
    }

    const inlineBackground = modal.style?.background || "";
    const noDim =
      modal.dataset.modalNoDim === "true" ||
      modal.classList.contains("modal-overlay--no-dim") ||
      inlineBackground.includes("transparent");

    this.ensureOverlayClasses(modal, { noDim });
    modal.classList.add(this.showClass);
    modal.setAttribute("aria-hidden", "false");
    modal.removeAttribute("inert");

    const panel = this.ensurePanel(modal);
    // this.applyResponsiveLayout(panel);

    this.removeResizeListener();
    if (typeof window !== "undefined") {
      // this._resizeHandler = () => this.applyResponsiveLayout(panel);
      window.addEventListener("resize", this._resizeHandler);
    }

    this.lazyLoadImages(modal);
    this.activeModal = modal;

    const lockId = `modal-${id}`;
    if (this.activeLockId && this.activeLockId !== lockId) {
      unlockScroll(this.activeLockId);
    }
    lockScroll(lockId);
    this.activeLockId = lockId;

    if (onConfirmCallback) {
      modal.addEventListener("click", (event) => this.handleConfirm(event, id, onConfirmCallback), {
        once: true,
      });
    }

    const heading = modal.querySelector("#cart-recs-title");
    if (heading && !heading.textContent.trim()) {
      heading.textContent = "Recommended products";
    }

    const closeBtn = modal.querySelector("[data-modal-close]");
    if (closeBtn) {
      closeBtn.setAttribute("aria-label", closeBtn.getAttribute("aria-label") || "Close");
    }

    if (!skipSlideIn) {
      if (timeout > 0 && panel) {
        window.setTimeout(() => {
          panel.classList.add("slide-in-active");
        }, timeout);
      } else if (panel) {
        panel.classList.add("slide-in-active");
      }
    }
  }

  hideModal(id) {
    const modal = document.querySelector(`[data-modal="${id}"]`);
    if (!modal) {
      console.error(`Modal with id '${id}' doesn't exist`);
      return false;
    }

    this.activeModal = null;

    const activeElement = document.activeElement;
    if (activeElement && modal.contains(activeElement)) {
      try {
        activeElement.blur();
      } catch {
        /* noop */
      }
    }

    const panel = modal.querySelector(".modal-panel");
    panel?.classList.remove("slide-in-active");

    this.removeResizeListener();

    const lockId = this.activeLockId || `modal-${id}`;
    unlockScroll(lockId);
    if (this.activeLockId === lockId) {
      this.activeLockId = null;
    }

    modal.setAttribute("inert", "");

    window.setTimeout(() => {
      modal.classList.remove(this.showClass);
      modal.classList.remove("modal-overlay--visible");
      modal.setAttribute("aria-hidden", "true");
      modal.style.display = "none";
    }, 200);

    window.dispatchEvent(
      new CustomEvent(`${id}-modal-closed`, {
        detail: { modal: id },
      }),
    );

    return true;
  }

  handleConfirm(event, id, onConfirmCallback) {
    const button = event.target.closest("[data-modal-confirm]");
    if (button && typeof onConfirmCallback === "function") {
      onConfirmCallback();
    }
  }
}

if (typeof window !== "undefined") {
  window.ModalController = ModalController;
}
