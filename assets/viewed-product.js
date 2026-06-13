export class ViewedProduct {
  constructor() {
    this.selectors = {
      product_form: ".product-form",
    };
    this.init();
  }

  init() {
    this.storeViewedProducts();
  }

  storeViewedProducts() {
    let storedRecentProducts = localStorage.getItem("viewedProducts");
    let recentProducts = [];
    if (storedRecentProducts) {
      recentProducts = JSON.parse(storedRecentProducts);
    }
    const currentProduct = document
      .querySelector(this.selectors.product_form)
      .getAttribute("data-product-handle");
    const productIndex = recentProducts.indexOf(currentProduct);
    if (productIndex !== -1) {
      recentProducts.splice(productIndex, 1);
    }
    recentProducts.unshift(currentProduct);
    recentProducts = recentProducts.slice(0, 20);
    localStorage.setItem("viewedProducts", JSON.stringify(recentProducts));
  }
}
