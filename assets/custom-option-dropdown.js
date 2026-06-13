const PROCESSING_MS = 100;

/** @type {AbortController | null} */
let documentClickController = null;
/** @type {Set<CustomOptionDropdown>} */
const instances = new Set();

function ensureDocumentClickListener() {
  if (documentClickController) {
    return;
  }

  documentClickController = new AbortController();
  const { signal } = documentClickController;

  document.addEventListener(
    "click",
    (event) => {
      if (event.target.closest("custom-option-dropdown")) {
        return;
      }

      instances.forEach((instance) => {
        instance.close();
      });
    },
    { signal },
  );
}

function releaseDocumentClickListener() {
  if (instances.size > 0 || !documentClickController) {
    return;
  }

  documentClickController.abort();
  documentClickController = null;
}

export class CustomOptionDropdown extends HTMLElement {
  #abortController = null;
  #toggle = null;
  #options = null;
  #selectedText = null;

  connectedCallback() {
    this.#abortController = new AbortController();
    const { signal } = this.#abortController;

    this.#toggle = this.querySelector(".dropdown-toggle");
    this.#options = this.querySelector(".dropdown-options");
    this.#selectedText = this.querySelector(".selected-text");

    if (!this.#toggle || !this.#options) {
      return;
    }

    instances.add(this);
    ensureDocumentClickListener();

    this.#toggle.addEventListener("click", this.#onToggleClick, { signal });

    this.querySelectorAll('input[type="radio"]').forEach((radio) => {
      radio.addEventListener("change", this.#onRadioChange, { signal });
    });
  }

  disconnectedCallback() {
    this.#abortController?.abort();
    this.#abortController = null;
    instances.delete(this);
    releaseDocumentClickListener();
  }

  close() {
    if (!this.#toggle || !this.#options) {
      return;
    }

    this.#toggle.classList.remove("open");
    this.#options.classList.remove("open");
    this.#options.classList.add("hidden");
    this.classList.remove("dropdown-open");
  }

  setSelectedValue(value) {
    if (this.#selectedText && value != null) {
      this.#selectedText.textContent = value;
    }
  }

  #getScopeRoot() {
    return (
      this.closest("product-form") ||
      this.closest(".variant-selector-wrapper") ||
      this.parentElement
    );
  }

  #closeSiblingDropdowns() {
    const root = this.#getScopeRoot();
    if (!root) {
      return;
    }

    root.querySelectorAll("custom-option-dropdown").forEach((dropdown) => {
      if (dropdown !== this) {
        dropdown.close();
      }
    });
  }

  #onToggleClick = (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (!this.#toggle || !this.#options) {
      return;
    }

    if (this.#toggle.dataset.processing === "true") {
      return;
    }

    this.#toggle.dataset.processing = "true";
    window.setTimeout(() => {
      this.#toggle.dataset.processing = "false";
    }, PROCESSING_MS);

    const isOpen = this.#toggle.classList.contains("open");

    if (isOpen) {
      this.close();
      return;
    }

    this.#closeSiblingDropdowns();
    this.#toggle.classList.add("open");
    this.#options.classList.add("open");
    this.#options.classList.remove("hidden");
    this.classList.add("dropdown-open");
  };

  #onRadioChange = (event) => {
    const radio = event.target;
    if (!(radio instanceof HTMLInputElement) || !radio.checked) {
      return;
    }

    this.setSelectedValue(radio.value);
    this.close();
  };
}

if (!customElements.get("custom-option-dropdown")) {
  customElements.define("custom-option-dropdown", CustomOptionDropdown);
}
