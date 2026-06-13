export class SearchController extends HTMLElement {
  constructor() {
    super();

    /** @type {Object} Stores CSS selectors used throughout the class. */
    this.selectors = {
      classes: {
        predictiveSearch: "predictive-search-section",
        header: "site-header",
        mobileMenu: "mobile-menu",
        searchForm: "predictive-search-form",
        searchFormInput: "predictive-search-form__input",
        searchFormReset: "predictive-search-form__reset",
        searchResults: "predictive-search-results",
        scrollLock: "scroll-lock",
        searchActiveClass: "search-active",
        quickAddClose: "quick-add-close",
      },
      attributes: {
        searchTrigger: "open-predictive-search",
      },
    };

    this.sectionId = "predictive-search-results";
    this.interacted = false;
  }

  /**
   * Lifecycle method triggered when the element is added to the DOM.
   * Initializes key elements and event listeners.
   */
  connectedCallback() {
    // console.log('🚀🚀🚀 PREDICTIVE SEARCH INITIALISED...', this );

    // Main Elements
    this.mobileMenu = document.querySelector(`.${this.selectors.classes.mobileMenu}`);
    this.searchResults = this.querySelector(`.${this.selectors.classes.searchResults}`);
    this.searchForm = this.querySelector(`.${this.selectors.classes.searchForm}`);
    this.searchFormInput = this.querySelector(`.${this.selectors.classes.searchFormInput}`);

    this.init();
  }

  /**
   * Lifecycle method triggered when the element is removed from the DOM.
   * Logs the removal of the predictive search component.
   */
  disconnectedCallback() {
    // component removed; no-op
  }

  /**
   * Initializes event listeners for search interactions.
   */
  init() {
    document.addEventListener("click", this.handleEvent.bind(this));

    this.searchFormInput.addEventListener("keyup", this.handleKeydownEvent.bind(this));

    // this.togglePredictiveSearchResize();
  }

  /**
   * Initializes components on user interaction.
   */
  initOnInteraction() {
    this.initAccordions();
  }

  /**
   * Handles click events for toggling search, accordions, and resetting search input.
   * @param {Event} e - The click event.
   */
  handleEvent(e) {
    // console.log('🚀 CLICK TARGET: ', e.target );

    this.toggleSearch(e);
    this.handleAccordionClick(e);
    this.resetSearch(e);
  }

  /**
   * Handles keyup events on the search input field.
   * @param {Event} e - The keyup event.
   */
  handleKeydownEvent(e) {
    this.handleKeyboardControls(e);

    const query = e.target.value;
    this.handleSearch(query);
  }

  /**
   * Handles keyboard controls, such as closing the search on "Escape" key press.
   * @param {Event} e - The keydown event.
   */
  handleKeyboardControls(e) {
    if (e.key === "Escape") {
      this.close();
    }
  }

  /**
   * Resets the search input when the reset button is clicked.
   * @param {Event} e - The click event.
   */
  resetSearch(e) {
    if (e.target.classList.contains(this.selectors.classes.searchFormReset)) {
      // e.preventDefault();
      this.close();
    }
  }

  /**
   * Handles search requests based on user input.
   * @param {string|null} query - The search query; defaults to null for default content.
   */
  handleSearch(query = null) {
    if (this.controller) {
      // Cancel previous request
      this.controller.abort();
    }
    this.controller = new AbortController();
    const signal = this.controller.signal;

    let fetchUrl = "";
    let recommendedProducts = false;

    if (query.length < 3) {
      recommendedProducts = true;
      fetchUrl = `${window.Shopify.routes.root}search?section_id=${this.sectionId}`;
    } else {
      fetchUrl = `${window.Shopify.routes.root}search/suggest?q=${query}&resources[type]=product,collection,article,page&resources[options][unavailable_products]=last&[fields]=title,body,product_type,variants.title,tag&resources[limit_scope]=each&section_id=${this.sectionId}`;
    }

    const resultsContainer = this.querySelector(`.${this.selectors.classes.searchResults}`);
    resultsContainer.classList.add("results-loading");

    var requestResponse;
    fetch(fetchUrl, { signal })
      .then((response) => {
        requestResponse = response;
        return response.text();
      })
      .then((text) => {
        if (!requestResponse.ok) {
          throw new Error(`${requestResponse.status}: ${text}`);
        }

        const resultsMarkup = new DOMParser()
          .parseFromString(text, "text/html")
          .querySelector(`#shopify-section-${this.sectionId}`).innerHTML;
        // console.log('RESULTS: ', resultsMarkup );
        resultsContainer.innerHTML = resultsMarkup;
        const prodHeader = resultsContainer.querySelector(".resource-heading--product-grid");
        const productGrid = resultsContainer.querySelector(
          ".predictive-search-results__product-grid",
        );
        if (prodHeader) {
          prodHeader.classList.add("active");
        }
        if (productGrid) {
          productGrid.classList.add("search-active");
          productGrid.classList.remove("search-inactive");
        }
        // Open Last Accordion
        const accordions = resultsContainer.querySelectorAll(".resource-heading");
        if (accordions && accordions.length > 0) {
          const lastAccordion = accordions.length > 0 ? accordions[accordions.length - 1] : null;
          this.openAccordion(lastAccordion);
        }

        setTimeout(() => {
          resultsContainer.classList.remove("results-loading");
        }, 300);
      })
      .then(() => {
        if (recommendedProducts === true) {
          const prodHeader = resultsContainer.querySelector(".resource-heading--product-grid");
          if (prodHeader) {
            prodHeader.classList.remove("active");
          }
          const productGrid = document.querySelector(".predictive-search-results__product-grid");
          if (!productGrid.dataset.loaded) {
            this.fetchRecommendedProducts(productGrid);
            productGrid.classList.add("search-active");
          }
        }
      })
      .catch((error) => {
        if (error.name === "AbortError") {
          // console.log('🧨🧨 Fetch aborted! ');
        } else {
          console.error(error);
        }
      });
  }

  /**
   * Toggles the predictive search visibility based on user interaction.
   * @param {Event} e - The click event.
   */
  toggleSearch(e) {
    const target = e.target;

    const isQuickAddClose = target.closest(`.${this.selectors.classes.quickAddClose}`);

    if (!this || isQuickAddClose) {
      return;
    } else if (target.closest(`[${this.selectors.attributes.searchTrigger}]`)) {
      if (
        this.classList.contains(this.selectors.classes.searchActiveClass) &&
        !target.closest(`.${this.selectors.classes.predictiveSearch}`)
      ) {
        this.close();
      } else {
        this.open();

        // Set Interacted State
        if (!this.interacted) {
          this.interacted = true;

          this.initOnInteraction();
        }
      }
    } else if (
      this.classList.contains(this.selectors.classes.searchActiveClass) &&
      !target.closest(`.${this.selectors.classes.mobileMenu}`) &&
      !target.closest(`.${this.selectors.classes.header}`) &&
      !target.closest(`.${this.selectors.classes.predictiveSearch}`)
    ) {
      this.close();
    }
  }

  fetchRecommendedProducts(container) {
    const sectionId = "predictive-search-rec-products";

    fetch(window.Shopify.routes.root + `?section_id=${sectionId}`)
      .then((response) => {
        if (!response.ok) throw new Error("Network response was not ok");
        return response.text();
      })
      .then((html) => {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");

        const productCards = doc.querySelectorAll(".product-card");

        if (productCards.length > 0) {
          productCards.forEach((card) => {
            container.appendChild(card);
          });
          container.dataset.loaded = "true";
          const no_results = container.querySelector(".no-results");
          if (no_results) {
            no_results.style.display = "none";
          }
        }
      })
      .catch((error) => {
        console.error("Error loading recommended products section:", error);
      });
  }

  /**
   * Opens the predictive search panel and locks scrolling.
   */
  open() {
    if (this.classList.contains(this.selectors.classes.searchActiveClass)) {
      return;
    } else {
      // if ( this.mobileMenu ) {this.mobileMenu.close();

      this.setAttribute("aria-hidden", false);
      this.removeAttribute("inert");
      this.classList.add(this.selectors.classes.searchActiveClass);
      this.lockScrolling(true);
      const body = document.body;
      body.classList.toggle("no-scroll");

      this.searchFormInput.focus();
      // Only fetch the section if it's not already loaded
      const productGrid = document.querySelector(".predictive-search-results__product-grid");
      if (!productGrid.dataset.loaded) {
        this.fetchRecommendedProducts(productGrid);
      }
    }
  }

  /**
   * Closes the predictive search panel and unlocks scrolling.
   */
  close() {
    if (!this.classList.contains(this.selectors.classes.searchActiveClass)) {
      return;
    } else {
      this.lockScrolling(false);
      this.searchFormInput.blur();
      const body = document.body;
      body.classList.toggle("no-scroll");

      this.classList.remove(this.selectors.classes.searchActiveClass);
      this.setAttribute("aria-hidden", true);
      this.setAttribute("inert", "");

      // console.log('❌❌❌ Close Predictive Search...');
    }
  }

  /**
   * Fetches and displays recent searches from local storage.
   * This method is currently commented out but can be used to retrieve recent searches.
   */
  /*
    getRecentSearches() {
        const recentPlaceholder  = document.querySelector( this.selectors.recentPlaceholder );
        const recentContainer = recentPlaceholder.querySelector( this.selectors.recentContainer );

        const RECENT_SEARCHES_LOCAL_KEY = window.Shopify.shop.replace(/.myshopify.com/g,'') + '__recentSearches';
        const RECENT_SEARCHES_LOCAL = JSON.parse( localStorage.getItem(RECENT_SEARCHES_LOCAL_KEY) );

        if ( recentPlaceholder && recentContainer && RECENT_SEARCHES_LOCAL && RECENT_SEARCHES_LOCAL.length > 0 ) {
            const recentArrReverse = RECENT_SEARCHES_LOCAL.reverse();
            const recentSearchFragment = document.createDocumentFragment();

            recentArrReverse.forEach( searchTerm => {
                const searchLink = '/search?q=' + searchTerm + '&type=product';
                const linkNode = document.createElement('a');

                linkNode.setAttribute('href', searchLink);
                linkNode.textContent = searchTerm;
                linkNode.classList.add('link');

                recentSearchFragment.appendChild( linkNode );
            });

            recentContainer.appendChild( recentSearchFragment );

        } else {
            if ( recentPlaceholder ) recentPlaceholder.remove();
        }
    }
    */

  /**
   * Locks or unlocks page scrolling when the search is open.
   * @param {boolean} shouldLock - Whether to lock scrolling.
   */
  lockScrolling(shouldLock = false) {
    if (shouldLock === true) {
      document.body.classList.add(this.selectors.classes.scrollLock);
    } else {
      document.body.classList.remove(this.selectors.classes.scrollLock);
    }
  }

  /**
   * Handles click events on search result accordions.
   * @param {Event} e - The click event.
   */
  handleAccordionClick(e) {
    if (e.target.closest(".resource-heading")) {
      const accordion = e.target;
      this.openAccordion(accordion);
    }
  }

  /**
   * Initializes search result accordions by setting their content heights.
   */
  initAccordions() {
    const accordionPanels = this.querySelectorAll(
      ".resource-content, .predictive-search-results__product-grid",
    );
    if (accordionPanels && accordionPanels.length > 0) {
      accordionPanels.forEach((panel) => {
        panel.style.setProperty("--content-height", `9999px`);
      });

      // Open Last Accordion
      const accordions = this.querySelectorAll(
        `.${this.selectors.classes.searchResults} .resource-heading`,
      );
      if (accordions && accordions.length > 0) {
        const lastAccordion = accordions.length > 0 ? accordions[accordions.length - 1] : null;
        this.openAccordion(lastAccordion);
      }
    }
  }

  /**
   * Closes all open accordions within the search results.
   */
  closeAllAccordions() {
    const accordionPanels = this.querySelectorAll(
      ".resource-content, .predictive-search-results__product-grid",
    );
    if (accordionPanels && accordionPanels.length > 0) {
      accordionPanels.forEach((panel) => {
        panel.classList.remove("accordion-open");
        panel.style.setProperty("--content-height", `0px`);
      });
    }
  }

  /**
   * Opens a specific accordion and ensures only one is open at a time.
   * @param {HTMLElement} accordion - The accordion element to open.
   */
  openAccordion(accordion) {
    const panel = accordion?.nextElementSibling;

    if (accordion && panel) {
      const isAlreadyOpen = panel.classList.contains("accordion-open");

      this.closeAllAccordions();

      if (!isAlreadyOpen) {
        panel.style.setProperty("--content-height", `9999px`);
        panel.classList.add("accordion-open");
      }
    }
  }
}

customElements.define("predictive-search", SearchController);
