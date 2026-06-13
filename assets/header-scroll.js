export class HeaderScrollController {
  constructor() {
    this.bodyEl = document.body;
    this.announcementBar = document.querySelector(".announcement-bar-section");
    this.headerEl = document.querySelector(".header-outer-shopify-wrapper");
    this.announcementBarHeight = 0;
    this.scrolled = false;

    if (!this.headerEl || !this.bodyEl) return;

    this.init();
  }

  init() {
    this.calculateAnnouncementBarHeight();
    this.setInitialState();
    this.setupScrollListener();

    window.addEventListener(
      "resize",
      () => {
        this.calculateAnnouncementBarHeight();
      },
      { passive: true },
    );
  }

  calculateAnnouncementBarHeight() {
    if (this.announcementBar) {
      this.announcementBarHeight = this.announcementBar.offsetHeight;
      this.bodyEl.style.setProperty("--announcement-bar-height", `${this.announcementBarHeight}px`);
    }
  }

  setInitialState() {
    this.handleScroll();
  }

  setupScrollListener() {
    let ticking = false;

    window.addEventListener(
      "scroll",
      () => {
        if (!ticking) {
          window.requestAnimationFrame(() => {
            this.handleScroll();
            ticking = false;
          });
          ticking = true;
        }
      },
      { passive: true },
    );
  }

  handleScroll() {
    const scrollTop = window.scrollY || window.pageYOffset;

    if (scrollTop === 0) {
      this.resetScrollState();
      return;
    }

    if (scrollTop > 30 && !this.scrolled) {
      this.applyScrollState();
    } else if (scrollTop <= 30 && this.scrolled) {
      this.resetScrollState();
    }
  }

  resetScrollState() {
    this.headerEl.classList.remove("scrolled-past");
    this.scrolled = false;

    if (this.announcementBar) {
      this.bodyEl.style.setProperty("--announcement-bar-height", `${this.announcementBarHeight}px`);
      this.headerEl.style.marginTop = "";
      this.announcementBar.style.marginTop = "";
    }
  }

  applyScrollState() {
    this.headerEl.classList.add("scrolled-past");
    this.scrolled = true;

    // if (this.announcementBar) {
    //   this.headerEl.style.marginTop = `-${this.announcementBarHeight}px`;
    //   this.announcementBar.style.marginTop = `-${this.announcementBarHeight}px`;
    // }
  }
}
