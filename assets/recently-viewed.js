const STORAGE_KEY = "viewedProducts";
const SECTION_SELECTOR = "[data-recently-viewed-section]";
const SLIDER_SELECTOR = "[data-recently-viewed-slider]";
const TRACK_SELECTOR = ".blaze-track";
const ARROWS_SELECTOR = ".blaze-navigation-arrows";
const ROOT_MARGIN = "500px";

const getStoredHandles = () => {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch (error) {
    console.warn("Recently viewed storage unavailable", error);
    return null;
  }
};

const parseHandles = (value) => {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.map((handle) => String(handle).trim()).filter(Boolean);
    }
  } catch (error) {
    // fall through to string parsing
  }

  return value
    .replace(/[\[\]]/g, "")
    .split(",")
    .map((handle) => handle.replace(/"/g, "").trim())
    .filter(Boolean);
};

const dedupe = (items) => {
  const seen = new Set();
  const result = [];

  items.forEach((item) => {
    if (seen.has(item)) {
      return;
    }
    seen.add(item);
    result.push(item);
  });

  return result;
};

const waitForBlazeInstance = (sliderEl) => {
  if (!sliderEl) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    if (sliderEl.__themeBlazeSlider) {
      resolve(sliderEl.__themeBlazeSlider);
      return;
    }

    const check = () => {
      if (sliderEl.__themeBlazeSlider) {
        resolve(sliderEl.__themeBlazeSlider);
        return;
      }
      requestAnimationFrame(check);
    };

    check();
  });
};

const fetchProductCard = async (handle) => {
  const root = window.Shopify && window.Shopify.routes ? window.Shopify.routes.root : "/";
  const url = `${root}products/${encodeURIComponent(handle)}?section_id=product-card`;
  const response = await fetch(url, { credentials: "same-origin" });

  if (!response.ok) {
    throw new Error(`Section render failed with status ${response.status}`);
  }

  const html = await response.text();
  const doc = new DOMParser().parseFromString(html, "text/html");
  const productCard = doc.querySelector("product-card");

  if (!productCard) {
    return null;
  }

  const productId = productCard.getAttribute("data-product-id");

  if (productId === null || productId === "") {
    return null;
  }

  return productCard.outerHTML;
};

class RecentlyViewedSlider {
  constructor(section) {
    this.section = section;
    this.slider = section.querySelector(SLIDER_SELECTOR);
    this.track = this.slider?.querySelector(TRACK_SELECTOR) || null;
    this.arrows = section.querySelector(ARROWS_SELECTOR);
    this.maxProducts = Number(section.dataset.maxProducts || 12);

    if (!this.slider || !this.track) {
      return;
    }

    const stored = getStoredHandles();
    const handles = dedupe(parseHandles(stored)).slice(-this.maxProducts).reverse();

    if (!handles.length) {
      this.handleEmpty();
      return;
    }

    this.handles = handles;
    if (this.arrows) {
      this.arrows.hidden = true;
    }
    this.initObserver();
  }

  initObserver() {
    this.slider.setAttribute("hidden", "hidden");
    this.slider.setAttribute("aria-busy", "true");

    this.observer = new IntersectionObserver(
      (entries) => {
        const isVisible = entries.some((entry) => entry.isIntersecting);
        if (!isVisible) {
          return;
        }
        this.observer.disconnect();
        this.load();
      },
      {
        rootMargin: `${ROOT_MARGIN} 0px ${ROOT_MARGIN}`,
      },
    );

    this.observer.observe(this.section);
  }

  async load() {
    let appended = 0;
    const fragment = document.createDocumentFragment();

    for (const handle of this.handles) {
      try {
        const markup = await fetchProductCard(handle);
        if (!markup) {
          continue;
        }

        const slide = document.createElement("div");
        slide.classList.add("h-auto");
        slide.innerHTML = markup;
        fragment.appendChild(slide);
        appended += 1;
      } catch (error) {
        console.warn(`Recently viewed product failed for handle "${handle}"`, error);
      }
    }

    // Single DOM manipulation after all slides are prepared
    if (appended > 0) {
      this.track.appendChild(fragment);
    }

    if (appended === 0) {
      this.handleEmpty();
      return;
    }

    this.slider.classList.remove("blaze-loading");
    this.slider.removeAttribute("hidden");
    this.slider.removeAttribute("aria-busy");

    if (this.arrows) {
      this.arrows.hidden = appended <= 1;
    }

    const minSlidesForLoop = Number(this.slider.dataset.minSlidesForLoop || 2);
    if (this.slider.dataset.sliderLoop === "true" && appended < minSlidesForLoop) {
      this.slider.dataset.sliderLoop = "false";
      console.warn(
        `Recently Viewed: loop disabled due to insufficient slides. Need at least ${minSlidesForLoop}, got ${appended}.`,
      );
    }

    const controller = window.themeBlazeSliderController;
    if (controller && typeof controller.refresh === "function") {
      controller.refresh(this.slider);
    }

    const blaze = await waitForBlazeInstance(this.slider);
    if (blaze && typeof blaze.refresh === "function") {
      blaze.refresh();
    }
  }

  handleEmpty() {
    if (this.slider) {
      this.slider.classList.remove("blaze-loading");
      this.slider.setAttribute("hidden", "hidden");
      this.slider.removeAttribute("aria-busy");
    }

    if (this.arrows) {
      this.arrows.hidden = true;
    }

    this.section.hidden = true;
  }
}

const initRecentlyViewed = () => {
  const sections = document.querySelectorAll(SECTION_SELECTOR);
  sections.forEach((section) => new RecentlyViewedSlider(section));
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initRecentlyViewed);
} else {
  initRecentlyViewed();
}
