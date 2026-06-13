export class Recommendations {
  constructor(selector = ".recommended-products-wrapper") {
    this.selector = selector;
    this.section = document.querySelector(selector);
    this.observer = null;
    this.observerTarget = null;
    this.hasLoaded = false;
    this.isLoading = false;
    this.fallbackTimer = null;

    if (this.section) {
      this.observerTarget = this.resolveObserverTarget();
      this.init();
    }
  }

  resolveObserverTarget() {
    if (!this.section) return null;
    return (
      this.section.closest("[data-recommendations-observe]") ||
      this.section.closest(".product-recommendations") ||
      this.section.parentElement ||
      this.section
    );
  }

  init() {
    const target = this.observerTarget || this.section;
    if (!target) return;

    if (typeof window.IntersectionObserver !== "function") {
      this.loadRecommendations();
      return;
    }

    const options = {
      rootMargin: "400px",
    };

    this.observer = new IntersectionObserver((entries) => {
      this.handleIntersection(entries);
    }, options);

    this.observer.observe(target);

    // Fallback: if the element has no dimensions, IntersectionObserver will never fire.
    if (target.getBoundingClientRect().height === 0) {
      requestAnimationFrame(() => {
        if (!this.hasLoaded) {
          this.loadRecommendations();
        }
      });
    }

    // Absolute fallback to guard against observers not firing in edge cases.
    this.fallbackTimer = window.setTimeout(() => {
      if (!this.hasLoaded) {
        this.loadRecommendations();
      }
    }, 4000);
  }

  handleIntersection(entries) {
    if (!Array.isArray(entries)) return;

    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      if (this.observer) {
        this.observer.unobserve(entry.target);
      }
      this.loadRecommendations();
    });
  }

  async loadRecommendations() {
    if (this.isLoading || this.hasLoaded) return;

    const url = this.section.dataset.url;

    if (!url) {
      console.error("Recommendations: No URL found in dataset");
      this.hasLoaded = true;
      return;
    }

    this.isLoading = true;

    try {
      const response = await fetch(url, { credentials: "same-origin" });

      if (response.status === 401) {
        console.warn(
          "Recommendations: Request was unauthorized. This often happens when viewing a password-protected preview.",
        );
        this.onNoRecommendations();
        return;
      }

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const text = await response.text();
      const html = document.createElement("div");
      html.innerHTML = text;

      // Look for the wrapper in the response first
      let recommendations = html.querySelector(".recommended-products-wrapper");

      // If no wrapper found, fall back to .product-recommendations
      if (!recommendations) {
        recommendations = html.querySelector(".product-recommendations");
      }

      if (recommendations && recommendations.innerHTML.trim().length) {
        // Insert only the contents, not the wrapper itself
        this.section.innerHTML = recommendations.innerHTML;
        this.onRecommendationsLoaded();
      } else {
        this.onNoRecommendations();
      }
    } catch (error) {
      console.error("Recommendations: Failed to load recommendations", error);
      this.onLoadError(error);
    } finally {
      if (this.fallbackTimer) {
        clearTimeout(this.fallbackTimer);
        this.fallbackTimer = null;
      }
      this.isLoading = false;
      this.hasLoaded = true;
    }
  }

  onRecommendationsLoaded() {
    this.initLoadedSlider();
  }

  resolveLiveNavScope(root, slider) {
    if (!slider) return "";

    const sectionScope =
      slider.closest('[id^="shopify-section-"]') ||
      root?.closest?.('[id^="shopify-section-"]') ||
      null;

    if (sectionScope?.id) {
      return `#${sectionScope.id}`;
    }

    return "";
  }

  ensureNavigationDataset(root, slider) {
    if (!slider) return;

    const liveScope = this.resolveLiveNavScope(root, slider);
    if (liveScope) {
      slider.dataset.sliderNavScope = liveScope;
    }

    if (!slider.dataset.sliderNavNext) {
      slider.dataset.sliderNavNext = ".blaze-button-next";
    }

    if (!slider.dataset.sliderNavPrev) {
      slider.dataset.sliderNavPrev = ".blaze-button-prev";
    }
  }

  initLoadedSlider() {
    const root = this.section;
    if (!root || typeof root.querySelector !== "function") return;

    const slider = root.querySelector("[data-blaze-slider]");
    if (!slider) return;

    this.ensureNavigationDataset(root, slider);

    const controller = window.themeBlazeSliderController;
    if (controller && typeof controller.init === "function") {
      controller.init(root);
      return;
    }

    import("@theme/blaze-slider-controller")
      .then(({ blazeSliderController }) => {
        blazeSliderController.init(root);
      })
      .catch((error) => {
        console.warn("Recommendations: failed to initialize slider", error);
      });
  }

  onNoRecommendations() {
    // Hook for when no recommendations are found
    // Can be overridden or extended
  }

  onLoadError(error) {
    // Hook for when loading fails
    // Can be overridden or extended
  }

  destroy() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    if (this.fallbackTimer) {
      clearTimeout(this.fallbackTimer);
      this.fallbackTimer = null;
    }
  }
}

// Auto-initialize if script is loaded directly (backward compatibility)
if (typeof module === "undefined") {
  document.addEventListener("DOMContentLoaded", () => {
    new Recommendations();
  });
}
