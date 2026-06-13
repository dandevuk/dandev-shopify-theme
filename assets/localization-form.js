import { ModalController } from "@theme/modal-controller";

class LocalizationForm extends HTMLElement {
  constructor() {
    super();
    this.elements = {
      input: this.querySelector('input[name="language_code"], input[name="country_code"]'),
      button: this.querySelector("button"),
      panel: this.querySelector("ul"),
    };
    this.elements.button.addEventListener("click", this.openSelector.bind(this));
    this.elements.button.addEventListener("focusout", this.closeSelector.bind(this));
    this.addEventListener("keyup", this.onContainerKeyUp.bind(this));
    this.querySelectorAll("a").forEach((item) =>
      item.addEventListener("click", this.onItemClick.bind(this)),
    );

    if (!sessionStorage.getItem("localization_form_submitted")) {
      this.detectLocation();
    }
  }
  hidePanel() {
    this.elements.button.setAttribute("aria-expanded", "false");
    this.elements.panel.setAttribute("hidden", true);
  }
  onContainerKeyUp(event) {
    if (event.code.toUpperCase() !== "ESCAPE") return;
    this.hidePanel();
    this.elements.button.focus();
  }
  onItemClick(event) {
    event.preventDefault();
    const form = this.querySelector("form");
    this.elements.input.value = event.currentTarget.dataset.value;
    if (form) {
      form.submit();
      sessionStorage.setItem("localization_form_submitted", "true");
    }
  }
  openSelector() {
    this.elements.button.focus();
    this.elements.panel.toggleAttribute("hidden");
    this.elements.button.setAttribute(
      "aria-expanded",
      (this.elements.button.getAttribute("aria-expanded") === "false").toString(),
    );
  }
  closeSelector(event) {
    const shouldClose = event.relatedTarget && event.relatedTarget.nodeName === "BUTTON";
    if (event.relatedTarget === null || shouldClose) {
      this.hidePanel();
    }
  }
  async detectLocation() {
    try {
      const response = await fetch(
        window.Shopify.routes.root +
          "browsing_context_suggestions.json" +
          "?country[enabled]=true" +
          `&country[exclude]=${window.Shopify.country}` +
          "&language[enabled]=true" +
          `&language[exclude]=${window.Shopify.language}`,
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (data.suggestions && data.suggestions.length > 0) {
        const suggestion = data.suggestions[0];
        const currentCountry =
          window.Theme?.localization?.country?.iso_code || window.Shopify.country;

        if (
          suggestion.parts.country?.handle === currentCountry ||
          suggestion.parts.country?.name === window.Theme?.localization?.country?.name
        ) {
          return;
        }

        const modal = document.querySelector('[data-modal="location-selector-id"]');

        if (!modal) {
          console.warn("Location selector modal not found in DOM");
          return;
        }

        const modalController = new ModalController();
        modalController.presentModal("location-selector-id");
      }
    } catch (error) {
      console.error("Error fetching browsing context suggestions:", error);
    }
  }
}
customElements.define("localization-form", LocalizationForm);
