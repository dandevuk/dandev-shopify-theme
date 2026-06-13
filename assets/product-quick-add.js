export class ProductQuickAdd {
  constructor() {
    this.selectors = {
      quickAdds: "[quick-add-qf]",
      formEl: "product-form",
      productForm: `[action="${window.Shopify.routes.root}cart/add"]`,
    };

    this.handleClickDelegate = this.handleClick.bind(this);
    this.handleSubmitDelegate = this.handleSubmit.bind(this);

    if (typeof document !== "undefined" && document.body) {
      document.body.addEventListener("click", this.handleClickDelegate);
      document.body.addEventListener("submit", this.handleSubmitDelegate);
    }
  }

  destroy() {
    if (typeof document === "undefined" || !document.body) return;

    document.body.removeEventListener("click", this.handleClickDelegate);
    document.body.removeEventListener("submit", this.handleSubmitDelegate);
  }

  handleClick(e) {
    const quickAdd = e.target.closest(this.selectors.quickAdds);
    if (quickAdd) {
      e.preventDefault();
      const quantity = parseInt(quickAdd.dataset.quantity);
      if (quickAdd.dataset.id && quantity > 0) {
        // Close quickview first so the sidecart opened by cart.add() is visible
        const quickViewInner = document.querySelector("quick-view-inner");
        if (quickViewInner && typeof quickViewInner.closeModal === "function") {
          quickViewInner.closeModal();
        } else {
          const q = document.querySelector("quickview-modal");
          if (q) {
            q.removeAttribute("open");
            setTimeout(() => {
              q.innerHTML = "";
            }, 300);
          }
        }
        window.cart.add({ items: [{ id: quickAdd.dataset.id, quantity }] });
      }
    }
  }

  async handleSubmit(e) {
    const formEL = e.target.closest(this.selectors.formEl);
    if (!formEL) return;
    e.preventDefault();
    const form = formEL.querySelector(this.selectors.productForm);
    if (!form) return;
    const product_id = form.getAttribute("data-product-id");
    const section_id = formEL.getAttribute("data-section-id");

    const quantity_el = form.querySelector("[quantity-select] input[type='number']");
    const quantity = quantity_el ? parseInt(quantity_el.value) : 1;

    const id =
      formEL.querySelector('input[name="id"]')?.value ||
      formEL.querySelector("[add-to-cart][data-id]")?.dataset.id ||
      formEL.querySelector(`#product-id-${section_id}-${product_id}`)?.value ||
      (product_id
        ? formEL.querySelector(`#product-id-quick-add-card-${product_id}-${product_id}`)?.value
        : null);

    if (!id) {
      console.warn("ProductQuickAdd: variant id not found for add to cart");
      return;
    }

    const price_el = form.querySelector("[data-variant-price-submit]");
    let price = 0;
    let currency = "";
    if (price_el) {
      const text = price_el.textContent.trim();

      const parts = text.split(/\s+/);
      let firstPart = parts[0];
      let numberPart = parts.length > 1 ? parts[1] : text.replace(firstPart, "");

      currency = firstPart.length > 1 ? firstPart : firstPart[0];

      const cleanNumber = numberPart.replace(/[^\d.]/g, "");
      const floatPrice = parseFloat(cleanNumber) || 0;

      // ✅ Convert to minor units
      price = Math.round(floatPrice * 100);
    }

    let properties = {};

    formEL.querySelectorAll("[property]").forEach((field) => {
      const key = field.getAttribute("name");
      const value = field.value;
      if (key && value) properties[key] = value;
    });

    const sellingPlanRaw = formEL.querySelector('input[name="selling_plan"]')?.value?.trim() || "";
    const sellingPlanId = sellingPlanRaw ? parseInt(sellingPlanRaw, 10) : NaN;
    const item = { id, quantity, properties };
    if (Number.isFinite(sellingPlanId)) {
      item.selling_plan = sellingPlanId;
    }

    if (quantity && id) {
      // Close quickview first so the sidecart opened by cart.add() is visible
      const quickViewInner = document.querySelector("quick-view-inner");
      if (quickViewInner && typeof quickViewInner.closeModal === "function") {
        quickViewInner.closeModal();
      } else {
        const q = document.querySelector("quickview-modal");
        if (q) {
          q.removeAttribute("open");
          setTimeout(() => {
            q.innerHTML = "";
          }, 300);
        }
      }
      window.cart.add({ items: [item] });
    }
  }
}
