export class GiftCardFields {
  constructor() {
    this.selectors = {
      gift_card_fields: "[product-gift-card-fields]",
      send_as_gift_input: "[send_as_gift_input]",
      hide_gift_fields_trigger: "[show_hide_gift_card_fields]",
    };
    this.init();
  }

  init() {
    this.attachEventListeners();
  }

  attachEventListeners() {
    // Add click event listener to the checkbox trigger
    const trigger = document.querySelector(this.selectors.hide_gift_fields_trigger);
    if (trigger) {
      trigger.addEventListener("change", (e) => this.hideGiftCardFields(e));
    }
  }

  hideGiftCardFields(e) {
    const hideGiftFieldsTrigger = e.target.closest(this.selectors.hide_gift_fields_trigger);

    if (hideGiftFieldsTrigger) {
      const giftCardFields = document.querySelector(this.selectors.gift_card_fields);
      const sendAsGiftInput = document.querySelector(this.selectors.send_as_gift_input);

      if (giftCardFields && sendAsGiftInput) {
        giftCardFields.classList.toggle("hidden");

        // toggle sendAsGiftInput value to false if fields hidden
        if (sendAsGiftInput.value === "on") {
          sendAsGiftInput.value = "false";
          sendAsGiftInput.removeAttribute("property");
          // set as disabled
          sendAsGiftInput.setAttribute("disabled", "disabled");
        } else {
          sendAsGiftInput.value = "on";
          sendAsGiftInput.setAttribute("property", "");
          // remove disabled attribute
          sendAsGiftInput.removeAttribute("disabled");
        }

        const inputs = giftCardFields.querySelectorAll('input:not([type="hidden"]), textarea');
        // removed required and toggle attribute property
        inputs.forEach((input) => {
          if (input.hasAttribute("required")) {
            input.removeAttribute("required");
            input.removeAttribute("property");
          } else {
            input.setAttribute("required", "required");
            input.setAttribute("property", "");
          }
        });
      }
    }
  }
}
