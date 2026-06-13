export class ProductCard extends HTMLElement {
  constructor() {
    super();
    this.productHandle = this.dataset.productHandle;
    this.querySelectorAll("[data-color-variant-id]").forEach((element) => {
      element.addEventListener("click", this.onVariantClick.bind(this));
    });
  }

  onVariantClick(event) {
    const variantId = event.currentTarget.dataset.colorVariantId;
    const imgSrc = event.currentTarget.dataset.img;
    const imgElement = this.querySelector(".primary-image");
    // Handle variant click
    // remove selected class from all
    this.querySelectorAll(".variant-colour-options .selected").forEach((el) => {
      el.classList.remove("selected");
    });
    // add selected class to clicked
    event.currentTarget.classList.add("selected");
    this.setAttribute("data-variant-id", variantId);

    if (imgElement && imgSrc) {
      imgElement.style.transition = "opacity 0.3s ease-in-out";
      imgElement.style.opacity = "0.5";
      imgElement.src = imgSrc;
      // remove srcset to avoid loading wrong image size
      imgElement.removeAttribute("srcset");
      imgElement.onload = () => {
        imgElement.style.opacity = "1";
      };
      // Add a small fade-in effect when the image changes
    }

    this.querySelectorAll("a").forEach((link) => {
      const url = new URL(link.href);
      url.searchParams.set("variant", variantId);
      link.href = url.toString();
    });
  }
}

customElements.define("product-card", ProductCard);
