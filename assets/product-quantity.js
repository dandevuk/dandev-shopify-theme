// Product quantity controller for product pages (unified snippet support)
// Exports a class to initialize like other product features.
export class ProductQuantity {
  constructor() {
    this.handleClick = this.handleClick.bind(this);

    // Prevent double-binding across partial renders
    if (document?.body?.dataset.productQtyBound === "true") {
      return;
    }

    document.body.addEventListener("click", this.handleClick);
    document.body.dataset.productQtyBound = "true";
  }

  handleClick(e) {
    const increase = e.target.closest(
      "[quantity-select] [data-quantity-increment], [quantity-select] [quantity-plus], [quantity-select] .plus",
    );
    const decrease = e.target.closest(
      "[quantity-select] [data-quantity-decrement], [quantity-select] [quantity-minus], [quantity-select] .minus",
    );
    const button = increase || decrease;
    if (!button) return;

    const root = button.closest("[quantity-select]");
    if (!root) return;

    const input = root.querySelector('input[type="number"]');
    const display = root.querySelector("[data-quantity-value],[quantity]");
    if (!input || !display) return;

    const step = parseInt(input.step || "1", 10) || 1;
    const min = parseInt(input.min || "1", 10) || 1;
    const max = parseInt(input.max || "10000000", 10) || 10000000;

    let current = parseInt(input.value || display.textContent || "1", 10);
    if (Number.isNaN(current)) current = 1;

    const delta = increase ? step : -step;
    let next = current + delta;

    if (next < min) next = min;
    if (next > max) next = max;
    if (next === current) return;

    // Find the product form that contains this quantity selector
    const productForm = button.closest("product-form");
    const variantSumbitPrice = productForm?.querySelector("[data-variant-price-submit]");
    if (variantSumbitPrice) {
      const price = parseFloat(variantSumbitPrice.dataset.price || "0");
      const subtotal = price * next;
      const priceFormatted = Shopify.formatMoney(subtotal, productForm?.dataset?.moneyFormat || "");

      variantSumbitPrice.innerHTML = `- ${priceFormatted}`;
    }

    input.value = String(next);
    display.textContent = String(next);

    const addToCart = productForm?.querySelector("[add-to-cart]");
    if (addToCart) {
      addToCart.dataset.quantity = String(next);
    }
  }

  destroy() {
    if (document?.body?.dataset.productQtyBound === "true") {
      document.body.removeEventListener("click", this.handleClick);
      delete document.body.dataset.productQtyBound;
    }
  }
}

// Optional: expose on window for debugging
window.ProductQuantity = window.ProductQuantity || ProductQuantity;
