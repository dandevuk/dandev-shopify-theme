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
        if (panel) panel.style.maxHeight = null;
        // Notify consumers that an accordion was collapsed
        window.dispatchEvent(
          new CustomEvent("accordion:change", { detail: { accordion, expanded: false } }),
        );
      } else {
        accordion.classList.add("active");
        accordion.setAttribute("aria-expanded", "true");
        if (panel) panel.style.maxHeight = panel.scrollHeight + "px";
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
          if (accPanel) accPanel.style.maxHeight = null;
          // Notify consumers that an accordion was collapsed
          window.dispatchEvent(
            new CustomEvent("accordion:change", { detail: { accordion: acc, expanded: false } }),
          );
        } else {
          acc.classList.add("active");
          acc.setAttribute("aria-expanded", "true");
          if (accPanel) accPanel.style.maxHeight = accPanel.scrollHeight + "px";
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
        if (accPanel) accPanel.style.maxHeight = null;
        // Notify consumers that an accordion was collapsed
        window.dispatchEvent(
          new CustomEvent("accordion:change", { detail: { accordion: acc, expanded: false } }),
        );
      }
    });
  }
}


