class GridLoadMore extends HTMLElement {
  constructor() {
    super();
    this.isLoading = false;
    this.grid = this.querySelector("[grid]");
    this.section = this.getAttribute("data-section");
    this.selectors = this.getAttribute("data-selectors");
    this.nextLink = this.getAttribute("data-next-url");
    this.loadMoreBtn = this.querySelector("[load-more-btn]");
    this._persistScrollTimer = null;
  }

  /** Keep scroll position for the same listing URL in sessionStorage (navigation back / reload + backfill). */
  _onPageHide = () => {
    this.persistScrollPosition();
  };

  _persistScrollOnScroll = () => {
    window.clearTimeout(this._persistScrollTimer);
    this._persistScrollTimer = window.setTimeout(() => this.persistScrollPosition(), 200);
  };

  _onGridLinkClick = (event) => {
    const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
    if (!anchor || !this.grid?.contains(anchor)) return;
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (anchor.target && anchor.target.toLowerCase() !== "_self") return;
    if (anchor.hasAttribute("download")) return;

    this.persistNavigationIntent(anchor.href);
  };

  connectedCallback() {
    if (!this.grid) {
      console.error("GridLoadMore: No grid element found with [grid] attribute");
      return;
    }

    if (!this.loadMoreBtn) {
      return;
    }

    if (!this.selectors) {
      console.error("GridLoadMore: No selectors specified in data-selectors attribute");
      return;
    }

    this.loadMoreBtn.addEventListener("click", this.loadMoreClickHandler);
    window.addEventListener("pagehide", this._onPageHide);
    window.addEventListener("scroll", this._persistScrollOnScroll, { passive: true });
    this.grid.addEventListener("click", this._onGridLinkClick);

    /** Preserved for restoring label + visually-hidden pagination links after loading. */
    if (this._loadMoreDefaultInnerHtml == null) {
      this._loadMoreDefaultInnerHtml = this.loadMoreBtn.innerHTML;
    }

    // Defer restore until after load + frames so browser scroll restoration can run first.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        void this.initializeLoadState();
      });
    });
  }

  /**
   * After navigation, restored scroll often lands after `load` + paint; waiting avoids capturing `0` too early.
   */
  waitForStableScrollRestoration() {
    return new Promise((resolve) => {
      const done = () =>
        requestAnimationFrame(() => requestAnimationFrame(resolve));

      if (document.readyState === "complete") {
        done();
      } else {
        window.addEventListener("load", () => done(), { once: true });
      }
    });
  }

  getScrollRestoreKey() {
    return `${this.getCollectionKey()}_scrollY`;
  }

  getRestoreIntentKey() {
    return `${this.getCollectionKey()}_restoreIntent`;
  }

  persistNavigationIntent(targetHref) {
    try {
      const targetUrl = new URL(targetHref, window.location.href);
      sessionStorage.setItem(
        this.getRestoreIntentKey(),
        JSON.stringify({
          fromKey: this.getCollectionKey(),
          timestamp: Date.now(),
        })
      );
    } catch {
      /* ignore malformed URL / storage issues */
    }
  }

  consumeNavigationIntent() {
    try {
      const key = this.getRestoreIntentKey();
      const rawIntent = sessionStorage.getItem(key);
      sessionStorage.removeItem(key);
      if (!rawIntent) return false;

      const intent = JSON.parse(rawIntent);
      if (!intent || intent.fromKey !== this.getCollectionKey()) return false;

      // Keep intent short-lived so stale sessions do not unexpectedly restore.
      return Date.now() - Number(intent.timestamp || 0) < 30 * 60 * 1000;
    } catch {
      return false;
    }
  }

  isHistoryNavigation() {
    try {
      const navEntry = performance.getEntriesByType("navigation")?.[0];
      if (navEntry && typeof navEntry.type === "string") {
        return navEntry.type === "back_forward";
      }
    } catch {
      /* ignore */
    }

    // Fallback for older browsers.
    return performance.navigation?.type === 2;
  }

  persistScrollPosition() {
    try {
      const y = window.scrollY || document.documentElement.scrollTop || 0;
      sessionStorage.setItem(this.getScrollRestoreKey(), String(y));
    } catch {
      /* ignore quota / private mode */
    }
  }

  /**
   * Read the deepest plausible scroll target before backfill (live position + last saved for this listing).
   */
  getBackfillScrollTarget() {
    let y = window.scrollY || document.documentElement.scrollTop || 0;
    try {
      const raw = sessionStorage.getItem(this.getScrollRestoreKey());
      if (raw != null) {
        const saved = parseInt(raw, 10);
        if (Number.isFinite(saved)) {
          y = Math.max(y, saved);
        }
      }
    } catch {
      /* ignore */
    }
    return y;
  }

  /**
   * Apply scroll after DOM changes; repeat to beat late browser restoration and `scroll-behavior: smooth`.
   */
  clampAndRestoreScroll(targetY) {
    const html = document.documentElement;
    html.style.scrollBehavior = "auto";

    const apply = () => {
      const maxScroll = Math.max(0, html.scrollHeight - window.innerHeight);
      const top = Math.max(0, Math.min(targetY, maxScroll));
      window.scrollTo(0, top);
    };

    apply();
    requestAnimationFrame(() => requestAnimationFrame(apply));
    [0, 50, 120, 320, 600].forEach((ms) => window.setTimeout(apply, ms));

    window.setTimeout(() => {
      html.style.removeProperty("scroll-behavior");
    }, 650);
  }

  async initializeLoadState() {
    await this.waitForStableScrollRestoration();

    if (!this.isHistoryNavigation()) return;

    const hasBackNavigationIntent = this.consumeNavigationIntent();
    if (!hasBackNavigationIntent) return;

    const storedCount = this.getStoredLoadedCount();
    const currentCount = this.getCurrentProductCount();

    if (storedCount > currentCount && this.nextLink) {
      await this.backfillItemsIfNeeded();
    }
  }

  async backfillItemsIfNeeded() {
    try {
      const storedCount = this.getStoredLoadedCount();
      const currentCount = this.getCurrentProductCount();

      if (storedCount > currentCount && this.nextLink) {
        this.grid?.classList.add("filter-results-pending");

        // Prefer saved + live max: restoration and VT can report 0 until backfill finishes.
        const initialScrollY = this.getBackfillScrollTarget();

        // Fetch all needed pages and collect items in a single fragment
        const allItemsFragment = document.createDocumentFragment();
        let currentNextLink = this.nextLink;
        let itemsCollected = 0;
        const itemsNeeded = storedCount - currentCount;

        // Process pages until we have enough items
        while (currentNextLink && itemsCollected < itemsNeeded) {
          const pageResult = await this.fetchPageData(currentNextLink);

          if (!pageResult.success || !pageResult.items.length) {
            console.warn("Failed to fetch page or no items found:", currentNextLink);
            break;
          }

          // Add items to our fragment (only add what we need)
          for (const item of pageResult.items) {
            if (itemsCollected >= itemsNeeded) break;
            allItemsFragment.appendChild(item);
            itemsCollected++;
          }

          // Update next link for subsequent requests
          currentNextLink = pageResult.nextLink;
        }

        // Add all collected items at once
        if (allItemsFragment.children.length > 0) {
          this.grid.appendChild(allItemsFragment);

          // Update the nextLink for future load more operations
          this.nextLink = currentNextLink;

          // Hide load more button if no more pages
          if (!currentNextLink && this.loadMoreBtn) {
            this.loadMoreBtn.classList.add("hidden");
          }
        }

        this.grid?.classList.remove("filter-results-pending");
        this.clampAndRestoreScroll(initialScrollY);
        this.persistScrollPosition();
      } else {
        this.grid?.classList.remove("filter-results-pending");
      }
    } catch (error) {
      console.warn("Failed to backfill items:", error);
      this.grid?.classList.remove("filter-results-pending");
    }
  }

  async fetchPageData(url) {
    // Fetch page data without adding to DOM - used for backfilling
    try {
      const response = await fetch(url, { method: "GET" });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

      const text = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, "text/html");
      const newItems = doc.querySelectorAll(this.selectors);

      // Get next URL for subsequent requests
      const nextGridElement = doc.querySelector("grid-load-more");
      const nextLink = nextGridElement?.getAttribute("data-next-url") || null;

      return {
        success: true,
        items: Array.from(newItems), // Convert NodeList to Array for easier handling
        nextLink: nextLink,
      };
    } catch (error) {
      console.error("Failed to fetch page data:", error);
      return {
        success: false,
        items: [],
        nextLink: null,
      };
    }
  }

  getCurrentProductCount() {
    return this.grid.querySelectorAll("product-card").length;
  }

  getCollectionKey() {
    // Create a unique key for this collection page including filters
    const url = new URL(window.location.href);
    url.searchParams.delete("page"); // Remove pagination to get base collection
    return `loadmore_${btoa(url.pathname + url.search).replace(/[^a-zA-Z0-9]/g, "")}`;
  }

  storeLoadedCount() {
    try {
      const currentCount = this.getCurrentProductCount();
      const key = this.getCollectionKey();
      localStorage.setItem(key, currentCount.toString());
      this.persistScrollPosition();
    } catch (error) {
      console.warn("Failed to store loaded count:", error);
    }
  }

  getStoredLoadedCount() {
    try {
      const key = this.getCollectionKey();
      const stored = localStorage.getItem(key);
      return stored ? parseInt(stored, 10) : 0;
    } catch (error) {
      console.warn("Failed to get stored loaded count:", error);
      return 0;
    }
  }

  clearStoredCount() {
    try {
      const key = this.getCollectionKey();
      localStorage.removeItem(key);
      sessionStorage.removeItem(this.getScrollRestoreKey());
      sessionStorage.removeItem(this.getRestoreIntentKey());
    } catch (error) {
      console.warn("Failed to clear stored count:", error);
    }
  }

  loadMoreClickHandler = (event) => {
    event.preventDefault();
    if (this.loadMoreBtn.disabled || this.isLoading) return;

    // Clear any previous error state
    this.loadMoreBtn.classList.remove("error");

    this.loadMoreBtn.disabled = true;
    this.loadMoreBtn.classList.add("loading");
    this.loadMoreBtn.setAttribute("aria-busy", "true");
    this.lockLoadMoreButtonSize();

    const loader = document.createElement("span");
    loader.classList.add("grid-loader");
    loader.setAttribute("aria-hidden", "true");
    loader.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 50" focusable="false" aria-hidden="true">
        <path fill="var(--brand-color-1)" d="M43.935,25.145c0-10.318-8.364-18.683-18.683-18.683c-10.318,0-18.683,8.365-18.683,18.683h4.068c0-8.071,6.543-14.615,14.615-14.615c8.072,0,14.615,6.543,14.615,14.615H43.935z">
          <animateTransform attributeType="xml"
            attributeName="transform"
            type="rotate"
            from="0 25 25"
            to="360 25 25"
            dur="0.6s"
            repeatCount="indefinite"/>
        </path>
      </svg>
    `;
    this.loadMoreBtn.replaceChildren(loader);
    this.fetchNextPage();
  };

  lockLoadMoreButtonSize() {
    if (!this.loadMoreBtn) return;
    const rect = this.loadMoreBtn.getBoundingClientRect();
    const width = Math.round(rect.width);
    const height = Math.round(rect.height);
    if (width > 0) {
      this.loadMoreBtn.style.minWidth = `${width}px`;
      this.loadMoreBtn.style.width = `${width}px`;
      this.loadMoreBtn.style.maxWidth = `${width}px`;
    }
    if (height > 0) {
      this.loadMoreBtn.style.minHeight = `${height}px`;
      this.loadMoreBtn.style.height = `${height}px`;
      this.loadMoreBtn.style.maxHeight = `${height}px`;
    }
  }

  unlockLoadMoreButtonSize() {
    if (!this.loadMoreBtn) return;
    this.loadMoreBtn.style.removeProperty("min-width");
    this.loadMoreBtn.style.removeProperty("width");
    this.loadMoreBtn.style.removeProperty("max-width");
    this.loadMoreBtn.style.removeProperty("min-height");
    this.loadMoreBtn.style.removeProperty("height");
    this.loadMoreBtn.style.removeProperty("max-height");
  }

  async fetchNextPage() {
    // Prevent multiple concurrent requests
    if (this.isLoading) {
      return;
    }

    if (!this.nextLink) {
      console.warn("GridLoadMore: No next link found");
      this.loadMoreBtn.disabled = false;
      this.loadMoreBtn.classList.remove("loading");
      this.loadMoreBtn.removeAttribute("aria-busy");
      this.unlockLoadMoreButtonSize();
      this.loadMoreBtn.classList.add("hidden");
      this.loadMoreBtn.innerHTML = this._loadMoreDefaultInnerHtml || this.loadMoreBtn.innerHTML;
      return;
    }

    this.isLoading = true;
    const nextUrl = this.nextLink;
    try {
      const response = await fetch(nextUrl, { method: "GET" });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const text = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, "text/html");
      const newItems = doc.querySelectorAll(this.selectors);

      // Safely get next URL
      const nextGridElement = doc.querySelector("grid-load-more");
      const upComingNextURL = nextGridElement?.getAttribute("data-next-url") || null;
      if (!upComingNextURL) {
        this.loadMoreBtn.classList.add("hidden");
      }

      // Use DocumentFragment for efficient DOM manipulation
      const fragment = document.createDocumentFragment();
      newItems.forEach((item) => fragment.appendChild(item));
      this.grid.appendChild(fragment);

      // Store current loaded count in localStorage to preserve state on browser navigation
      this.storeLoadedCount();

      this.nextLink = upComingNextURL;
    } catch (error) {
      console.error("GridLoadMore: Error fetching next page", error);

      // Show user-friendly error message
      if (this.loadMoreBtn) {
        this.loadMoreBtn.textContent = "Error loading more items. Click to retry.";
        this.loadMoreBtn.classList.add("error");
      }
    } finally {
      this.isLoading = false;
      if (this.loadMoreBtn) {
        this.loadMoreBtn.disabled = false;
        this.loadMoreBtn.classList.remove("loading");
        this.loadMoreBtn.removeAttribute("aria-busy");
        this.unlockLoadMoreButtonSize();
        if (!this.loadMoreBtn.classList.contains("error")) {
          this.loadMoreBtn.innerHTML = this._loadMoreDefaultInnerHtml || this.loadMoreBtn.innerHTML;
        }
      }
    }
  }

  // Optional: Enable auto-loading when button scrolls into view
  enableAutoLoad() {
    if (!("IntersectionObserver" in window)) {
      console.warn("GridLoadMore: IntersectionObserver not supported");
      return;
    }

    this.intersectionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !this.isLoading && this.nextLink) {
            this.loadMoreClickHandler(new Event("auto-load"));
          }
        });
      },
      { threshold: 0.1 }
    );

    this.intersectionObserver.observe(this.loadMoreBtn);
  }

  disconnectedCallback() {
    window.removeEventListener("pagehide", this._onPageHide);
    window.removeEventListener("scroll", this._persistScrollOnScroll);
    window.clearTimeout(this._persistScrollTimer);
    this.grid?.removeEventListener("click", this._onGridLinkClick);

    if (this.loadMoreBtn) {
      this.loadMoreBtn.removeEventListener("click", this.loadMoreClickHandler);
    }

    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect();
      this.intersectionObserver = null;
    }
  }
}

customElements.define("grid-load-more", GridLoadMore);
