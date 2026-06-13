const live_chat_btn = document.querySelector('.contact-form-wrapper a[href="#live-chat"]');

function findChat() {
  // Try to find the dummy chat button iframe
  const live_chat_icon = document.querySelector("#dummy-chat-button-iframe");
  if (live_chat_icon !== null) {
    try {
      live_chat_icon.contentWindow.document.body.querySelector(".chat-toggle").click();
      return;
    } catch (error) {
      console.warn("Shopify Chat: could not access dummy chat iframe content", error);
    }
  }

  // Try to find Shopify Chat with Shadow DOM
  const shopify_chat = document.querySelector("#ShopifyChat");
  if (shopify_chat !== null) {
    // Try to access shadow root
    if (shopify_chat.shadowRoot) {
      const chatToggle = shopify_chat.shadowRoot.querySelector(".chat-toggle");
      if (chatToggle) {
        chatToggle.click();
        return;
      }
    }

    // Fallback: try to find chat toggle button directly in the element
    const chatToggle = shopify_chat.querySelector(".chat-toggle");
    if (chatToggle) {
      chatToggle.click();
      return;
    }
  }
}

if (live_chat_btn) {
  live_chat_btn.addEventListener("click", () => {
    findChat();
  });
}
