// klaviyo-back-in-stock.js

export class KlaviyoBackInStock {
  constructor(formSelector = "form.notify-form") {
    this.form = document.querySelector(formSelector);
    if (!this.form) return; // no form on page, exit early

    this.messageContainer = document.querySelector(".pdp-sold-out-form__form .form-message");
    this.apiKey = this.form.dataset.klaviyoApiKey;
    this.productId = this.form.dataset.productId;

    if (this.messageContainer && this.apiKey && this.productId) {
      this.bindEvents();
    }
  }

  bindEvents() {
    this.form.addEventListener("submit", (e) => this.handleSubmit(e));
  }

  async handleSubmit(event) {
    event.preventDefault();

    const emailInput = this.form.querySelector('input[type="email"]');
    const notifyButton = this.form.querySelector("button");

    this.setLoadingState(notifyButton, true);

    try {
      const response = await fetch(
        `https://a.klaviyo.com/client/back-in-stock-subscriptions/?company_id=${this.apiKey}`,
        {
          method: "POST",
          headers: {
            revision: "2024-07-15",
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(this.buildPayload(emailInput.value)),
        },
      );

      if (response.status === 202) {
        this.showMessage("Success! You will be notified when the product is back in stock.");
        emailInput.value = "";
      } else {
        const data = await response.json().catch(() => ({}));
        this.showMessage("Error: " + (data.error_message || "Unable to process your request."));
      }
    } catch (error) {
      this.showMessage("Error: Unable to process your request. Please try again later.");
    } finally {
      this.setLoadingState(notifyButton, false);
    }
  }

  buildPayload(email) {
    return {
      data: {
        type: "back-in-stock-subscription",
        attributes: {
          channels: ["EMAIL"],
          profile: {
            data: {
              type: "profile",
              attributes: { email },
            },
          },
        },
        relationships: {
          variant: {
            data: {
              type: "catalog-variant",
              id: `$shopify:::$default:::${this.productId}`,
            },
          },
        },
      },
    };
  }

  setLoadingState(button, isLoading) {
    button.textContent = isLoading ? "Sending..." : "Notify Me";
    button.disabled = isLoading;
  }

  showMessage(message) {
    if (this.messageContainer) {
      this.messageContainer.textContent = message;
    }
  }
}

export const klaviyoBackInStock = new KlaviyoBackInStock();
