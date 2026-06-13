export class MenuController {
  constructor() {
    document.body.addEventListener("click", this.toggleMobileMenu.bind(this));
    this.showMegaMenuImages("#header-group");
  }

  toggleMobileMenu(e) {
    const menu = document.querySelector(".mobile-menu-outer-wrapper");
    const trigger = document.querySelector("#open-mobile-menu");
    if (!menu || !trigger) return;

    // Open/close menu
    if (e.target.closest("#open-mobile-menu")) {
      const isActive = menu.classList.contains("active");
      menu.classList.toggle("active");
      trigger.classList.toggle("active");

      const images = menu.querySelectorAll("img[data-src]");
      if (images.length === 0) return;
      images.forEach((img) => {
        if (img.dataset.src) img.src = img.dataset.src;
      });
    }

    // Close menu by clicking outside
    if (e.target === menu) {
      menu.classList.remove("active");
      trigger.classList.remove("active");
    }
  }

  showMegaMenuImages(selector) {
    const element = document.querySelector(selector);
    const images = document.querySelectorAll(`${selector} img`);
    if (!element || !images.length) return;

    element.addEventListener(
      "mouseenter",
      () => {
        images.forEach((img) => {
          if (img.dataset.src) img.src = img.dataset.src;
        });
      },
      { once: true },
    );
  }
}
