export const REQUEST_DELAY_MS = 120;
export const SECTION_HANDLES = {
  drawer: "side-cart",
  recommendations: "cart-recommendations",
  cart: "cart",
};
export const SHOPIFY_HEADERS = { "X-Requested-With": "XMLHttpRequest", Accept: "application/json" };
export const UNIQUE_ARRAY = (values = []) => Array.from(new Set(values.filter(Boolean)));
