export class AccordionController {
  constructor() {
    document.body.addEventListener("click", this.toggleAccordion.bind(this));
  }

  async initPanelSlider(panel) {
    if (!panel) return;

    const slider = panel.querySelector(
      "[data-blaze-slider], [data-cart-recommendations-slider], .cart-recommendations-slider",
    );
    if (!slider) return;

    let blazeController = window.themeBlazeSliderController || null;

    if (!blazeController) {
      try {
        const mod = await import("@theme/blaze-slider-controller");
        blazeController = mod?.blazeSliderController || null;
      } catch (error) {
        console.warn("AccordionController: failed to lazy-load blaze slider controller", error);
        return;
      }
    }

    try {
      if (slider.__themeBlazeSlider && typeof blazeController.refresh === "function") {
        blazeController.refresh(slider);
      } else if (typeof blazeController.init === "function") {
        blazeController.init(slider);
      }
    } catch (error) {
      console.warn("AccordionController: failed to initialize panel slider", error);
    }
  }

  // Expand the panel. A pixel value is used only to drive the opening
  // transition; once it finishes we release the cap to `none` so the
  // panel always matches its real content height (fonts swapping in,
  // images loading, blocks being added, text reflowing on resize, etc.
  // can no longer leave content clipped behind a stale snapshot).
  openPanel(panel) {
    if (!panel) return;
    panel.style.maxHeight = panel.scrollHeight + "px";

    const clearCap = (e) => {
      if (e && e.propertyName !== "max-height") return;
      panel.removeEventListener("transitionend", clearCap);
      if (panel.style.maxHeight !== "0px") {
        panel.style.maxHeight = "none";
      }
    };
    panel.addEventListener("transitionend", clearCap);
  }

  // Collapse the panel. If it's currently uncapped (`none`), first pin it
  // to its current rendered height so the transition has a numeric value
  // to animate from, then collapse to 0 on the next frame.
  closePanel(panel) {
    if (!panel) return;

    if (panel.style.maxHeight === "none" || panel.style.maxHeight === "") {
      panel.style.maxHeight = panel.scrollHeight + "px";
      // Force layout so the browser registers the pinned height before
      // we change it again, otherwise the two assignments coalesce and
      // the closing transition never animates.
      void panel.offsetHeight;
    }

    requestAnimationFrame(() => {
      panel.style.maxHeight = "0px";
    });
  }

  toggleAccordion(e) {
    // Support clicks on child elements inside the button by locating the nearest .accordion
    const accordion = e.target && e.target.closest ? e.target.closest(".accordion") : null;
    if (!accordion) return;

    e.preventDefault();
    const panel = accordion.nextElementSibling;

    // Find nearest ancestor that carries the data-allow-multiple attribute.
    // Default behavior (when attribute is missing or "false") is single-open.
    const sectionEl = accordion.closest("[data-allow-multiple]");
    const allowMultiple = sectionEl ? sectionEl.dataset.allowMultiple === "true" : false;

    if (allowMultiple) {
      // Toggle only the clicked accordion, do not close siblings.
      const isActive = accordion.classList.contains("active");
      if (isActive) {
        accordion.classList.remove("active");
        accordion.setAttribute("aria-expanded", "false");
        this.closePanel(panel);
        // Notify consumers that an accordion was collapsed
        window.dispatchEvent(
          new CustomEvent("accordion:change", { detail: { accordion, expanded: false } }),
        );
      } else {
        accordion.classList.add("active");
        accordion.setAttribute("aria-expanded", "true");
        this.openPanel(panel);
        void this.initPanelSlider(panel);
        // Notify consumers that an accordion was expanded
        window.dispatchEvent(
          new CustomEvent("accordion:change", { detail: { accordion, expanded: true } }),
        );
      }
      return;
    }

    // Single-open behavior (default): close other accordions within the same parent container.
    const parent = accordion.parentElement;
    const siblings = parent.getElementsByClassName("accordion");

    Array.from(siblings).forEach((acc) => {
      const accPanel = acc.nextElementSibling;

      if (acc === accordion) {
        // Toggle clicked accordion
        const wasActive = acc.classList.contains("active");
        if (wasActive) {
          acc.classList.remove("active");
          acc.setAttribute("aria-expanded", "false");
          this.closePanel(accPanel);
          // Notify consumers that an accordion was collapsed
          window.dispatchEvent(
            new CustomEvent("accordion:change", { detail: { accordion: acc, expanded: false } }),
          );
        } else {
          acc.classList.add("active");
          acc.setAttribute("aria-expanded", "true");
          this.openPanel(accPanel);
          void this.initPanelSlider(accPanel);
          // Notify consumers that an accordion was expanded
          window.dispatchEvent(
            new CustomEvent("accordion:change", { detail: { accordion: acc, expanded: true } }),
          );
        }
      } else {
        // Ensure others are closed
        acc.classList.remove("active");
        acc.setAttribute("aria-expanded", "false");
        this.closePanel(accPanel);
        // Notify consumers that an accordion was collapsed
        window.dispatchEvent(
          new CustomEvent("accordion:change", { detail: { accordion: acc, expanded: false } }),
        );
      }
    });
  }
}
