const FALLBACK_MESSAGES = {
  errorTitle: "Cart error",
  errorMessage: "Something went wrong. Please try again.",
};

function resolveMessage(key) {
  const overrides =
    (window.QF && window.QF.messages && window.QF.messages.cart) ||
    (window.theme && window.theme.cartMessages) ||
    {};
  const value = overrides[key];
  return typeof value === "string" && value.trim().length ? value : FALLBACK_MESSAGES[key];
}

export const cartMessages = {
  errorTitle() {
    return resolveMessage("errorTitle");
  },
  errorMessage() {
    return resolveMessage("errorMessage");
  },
};
