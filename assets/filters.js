import "@theme/load-more";

/** Named view transition for filter-driven collection grid swaps (see utilities.css). */
const FILTER_GRID_VIEW_TRANSITION_NAME = "filter-collection-grid";

/** Applied to the grid mount while filter results are fetching; dims cards via utilities.css */
const FILTER_RESULTS_PENDING_CLASS = "filter-results-pending";

class PriceRangeSlider extends HTMLElement {
  constructor() {
    super();
    this.rangeInputs = this.querySelectorAll('[range-input] input[type="range"]');
    this.range = this.querySelector('[slider] [progress-bar]');
    this.minInput = this.querySelector('[min-price-filter]');
    this.maxInput = this.querySelector('[max-price-filter]');
    this.priceInput = this.querySelectorAll('[price-input-show]');
    this.money_format = Theme?.localization?.currency?.money_format || '${{amount}}';
    this.priceGap = 1;
  }

  connectedCallback() {
    if (this.rangeInputs.length !== 2 || !this.range || !this.minInput || !this.maxInput) {
      console.error('PriceRangeSlider: Missing required elements');
      return;
    }

    this.initializeSlider();
    this.attachEventListeners();
  }

  initializeSlider() {
    // Initialize slider position based on existing values
    if (this.maxInput && this.minInput && this.maxInput.value !== "") {
      this.range.style.left = ((this.minInput.value / this.rangeInputs[0].max) * 100) + "%";
      this.range.style.right = 100 - (this.maxInput.value / this.rangeInputs[1].max) * 100 + "%";
      this.rangeInputs[0].value = this.minInput.value;
      this.rangeInputs[1].value = this.maxInput.value;
    }
  }

  attachEventListeners() {
    // Price input listeners
    this.priceInput.forEach(input => {
      input.addEventListener("input", (e) => {
        let minPrice = parseInt(this.priceInput[0].getAttribute("data-term"));
        let maxPrice = parseInt(this.priceInput[1].getAttribute("data-term"));

        if ((maxPrice - minPrice >= this.priceGap) && maxPrice <= this.rangeInputs[1].max) {
          if (e.target.className === "input-min") {
            this.rangeInputs[0].value = minPrice;
            this.rangeInputs[0].setAttribute("data-term", minPrice);
            this.range.style.left = ((minPrice / this.rangeInputs[0].max) * 100) + "%";
          } else {
            this.rangeInputs[1].value = maxPrice;
            this.maxInput.value = maxPrice;
            this.range.style.right = 100 - (maxPrice / this.rangeInputs[1].max) * 100 + "%";
          }
        }
      });
    });

    // Range input listeners
    this.rangeInputs.forEach(input => {
      input.addEventListener("input", (e) => {
        let minVal = parseInt(this.rangeInputs[0].value);
        let maxVal = parseInt(this.rangeInputs[1].value);

        if ((maxVal - minVal) < this.priceGap) {
          if (e.target.className === "range-min") {
            this.rangeInputs[0].value = maxVal - this.priceGap;
          } else {
            this.rangeInputs[1].value = minVal + this.priceGap;
          }
        } else {
          this.priceInput[0].setAttribute("data-term", minVal);
          this.priceInput[1].setAttribute("data-term", maxVal);
          this.priceInput[0].innerHTML = Shopify.formatMoney((minVal * 100), this.money_format).replace(/\.00$/, "");
          this.priceInput[1].innerHTML = Shopify.formatMoney((maxVal * 100), this.money_format).replace(/\.00$/, "");
          this.range.style.left = ((minVal / this.rangeInputs[0].max) * 100) + "%";
          this.range.style.right = 100 - (maxVal / this.rangeInputs[1].max) * 100 + "%";
          this.minInput.value = minVal;
          this.maxInput.value = maxVal;
        }
      });
    });
  }
}

customElements.define('price-range-slider', PriceRangeSlider);

class CustomFilter extends HTMLElement {
  static isGlobalListenerAttached = false;

  constructor() {
    super();
    this.control = this.querySelector('.filter-heading');
    this.body = this.querySelector('.filter-body');
  }

  connectedCallback() {
    if (!this.control || !this.body) {
      console.warn('CustomFilter: Missing required elements (.filter-heading or .filter-body)');
      return;
    }

    this.attachEventListeners();

    // Attach global click listener only once
    if (!CustomFilter.isGlobalListenerAttached) {
      CustomFilter.attachGlobalClickListener();
      CustomFilter.isGlobalListenerAttached = true;
    }
  }

  attachEventListeners() {
    this.control.addEventListener('click', () => {
      if (this.classList.contains('open')) {
        this.classList.remove('open');
      } else {
        // Close all other custom filters
        this.closeAllOtherFilters();
        // Open this filter
        this.classList.add('open');
      }
    });
  }

  closeAllOtherFilters() {
    const allCustomFilters = document.querySelectorAll('custom-filter');
    allCustomFilters.forEach((filter) => {
      if (filter !== this) {
        filter.classList.remove('open');
      }
    });
  }

  static attachGlobalClickListener() {
    document.body.addEventListener('click', (e) => {
      if (!e.target.closest('.custom-filter')) {
        const allCustomFilters = document.querySelectorAll('custom-filter');
        allCustomFilters.forEach((filter) => {
          filter.classList.remove('open');
        });
      }
    });
  }

  disconnectedCallback() {
    if (this.control) {
      this.control.removeEventListener('click', this.handleClick);
    }
  }
}

customElements.define('custom-filter', CustomFilter);

class Filters extends HTMLElement {
  constructor() {
    super();
    this.mobileControl = this.querySelector('.mobile-filter-heading');
    this.filterBody = this.querySelector('.custom-filter-wrapper');
    this.filterInputs = this.querySelectorAll('.filter-container-wrapper select, .filter-container-wrapper input');
    this.filterForm = this.querySelector('.filter-container');
    const filterWrapper = this.closest('.filter-wrapper');
    this.resetFilters = (filterWrapper || this).querySelectorAll('[data-reset-filters]');
    this.selectedFiltersHtml = this.querySelectorAll('[selected-filter], .selected-filter[data-param-remove]');
    this.collectionGrid = document.querySelector('[data-filter-grid]');
  }

  /** Inner grid container (`[grid]`) used for pending visual state on filter fetch. */
  getResultsOverlayMount() {
    if (!this.collectionGrid) return null;
    const scoped =
      this.collectionGrid.querySelector('.collection-grid.grid') ||
      this.collectionGrid.querySelector('.product-grid[grid]');
    return scoped || this.collectionGrid;
  }

  /**
   * Mount for filter-driven View Transitions only (not the outer `[data-filter-grid]` section).
   * A non-none `view-transition-name` on the section creates a stacking context, so the mobile
   * fixed filter shell no longer stacks above later page sections.
   */
  getFilterViewTransitionTarget() {
    if (!this.collectionGrid) return null;
    return (
      this.collectionGrid.querySelector('.collection-grid.grid') ||
      this.collectionGrid.querySelector('.product-grid[grid]') ||
      this.collectionGrid.querySelector('[grid]')
    );
  }

  /** Named transition on the product grid only; never on the section root. */
  setFilterGridViewTransitionName() {
    if (!this.collectionGrid) return;
    this.collectionGrid.style.removeProperty('view-transition-name');
    const target = this.getFilterViewTransitionTarget();
    if (target) {
      target.style.viewTransitionName = FILTER_GRID_VIEW_TRANSITION_NAME;
    }
  }

  /** Wrapper around filter UI for loading pointer-events. */
  getFilterPointerRoot() {
    return this.closest('.vertical-filters, .horizontal-filters, .filter-wrapper') || this;
  }

  connectedCallback() {
    this.attachMobileFilterListeners();
    this.attachFormSubmissionListeners();
    this.attachSelectedFilterListeners();
    this.attachResetFilterListener();
  }

  isMobileOrTabletViewport() {
    return window.matchMedia('(max-width: 991.98px)').matches;
  }

  getCollectionGridScrollTop() {
    if (!this.collectionGrid) return 0;
    const rect = this.collectionGrid.getBoundingClientRect();
    return Math.max(0, Math.round(window.scrollY + rect.top - 120));
  }

  prefersFilterViewTransition() {
    return (
      typeof document.startViewTransition === "function" &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }

  attachMobileFilterListeners() {
    if (this.mobileControl && this.filterBody) {
      this.mobileControl.addEventListener('click', () => {
        // Toggle mobile control open class
        if (this.mobileControl.classList.contains('open')) {
          this.mobileControl.classList.remove('open');
        } else {
          this.mobileControl.classList.add('open');
        }

        // Toggle filter body open class
        if (this.filterBody.classList.contains('open')) {
          this.filterBody.classList.remove('open');
        } else {
          this.filterBody.classList.add('open');
        }
      });
    }
  }

  attachFormSubmissionListeners() {
    if (this.filterInputs && this.filterForm && this.collectionGrid) {
      // Get the apply button you added in Liquid
      const applyBtn = this.filterForm.querySelector('.apply-filters-btn');

      // Responsive behavior:
      // - <992px: do not auto-submit on change
      // - >=992px: auto-submit on change
      this.filterInputs.forEach((input) => {
        input.addEventListener('change', (event) => {
          if (this.isMobileOrTabletViewport()) {
            event.stopPropagation();
            this.getResultsOverlayMount()?.classList.remove(FILTER_RESULTS_PENDING_CLASS);
            return;
          }

          this.handleFilterChange();
        });
      });

      // Explicit form submit / apply button should trigger filtering on all viewports.
      this.filterForm.addEventListener('submit', (event) => {
        event.preventDefault();
        this.handleFilterChange();
      });

      if (applyBtn) {
        applyBtn.addEventListener('click', (event) => {
          event.preventDefault();
          this.handleFilterChange();
        });
      }
    }
  }

  async handleFilterChange() {

    if (!this.filterForm || !this.collectionGrid) {
      return;
    }

    // Clear stored load more count since we're filtering
    this.clearLoadMoreState();

    // Show loading state
    this.showLoadingState();

    try {
      // Get form data manually instead of using FormData (which can be unreliable)

      const params = new URLSearchParams();

      // Get all form elements manually
      const formElements = this.filterForm.querySelectorAll('input, select, textarea');

      formElements.forEach((element, index) => {
        const name = element.name;
        let value = element.value;
        let shouldInclude = false;

        // Determine if this element should be included
        if (!name || name.trim() === '') {
          return;
        }

        switch (element.type) {
          case 'checkbox':
            shouldInclude = element.checked;
            break;
          case 'radio':
            shouldInclude = element.checked;
            break;
          case 'select-one':
          case 'select-multiple':
            // For select elements, check if a non-default option is selected
            shouldInclude = value && value.trim() !== '';
            break;
          default:
            // For text, number, range, etc.
            shouldInclude = value && value.trim() !== '';
            break;
        }

        if (shouldInclude) {
          params.append(name, value);
        }
      });


      // Build section request URL using current page URL
      const currentUrl = new URL(window.location.href);

      // Clear existing filter/search/sort params before rebuilding from form state.
      // We remove all `filter.*` keys dynamically so custom metafield filters are handled too.
      const keysToDelete = [];
      for (const [paramKey] of currentUrl.searchParams) {
        if (
          paramKey === 'sort_by' ||
          paramKey === 'type' ||
          paramKey === 'q' ||
          paramKey === 'page' ||
          paramKey.startsWith('filter.')
        ) {
          keysToDelete.push(paramKey);
        }
      }
      keysToDelete.forEach((key) => {
        currentUrl.searchParams.delete(key);
      });


      // Add new filter parameters to the request URL
      for (const [key, value] of params) {
        if (value && value.trim() !== '') {
          currentUrl.searchParams.append(key, value);
        }
      }

      // Add section parameter for Shopify section rendering
      const sectionName = this.getSectionName();
      if (sectionName) {
        currentUrl.searchParams.set('sections', sectionName);
      }


      // Check if we're in local development environment
      const isLocalDev = window.location.hostname === '127.0.0.1' ||
                        window.location.hostname === 'localhost' ||
                        window.location.port !== '';


      // Try section rendering first (skip in local dev as it often fails)
      let sectionsWorked = false;
      if (sectionName && !isLocalDev) {
        try {
          const response = await fetch(currentUrl.toString(), {
            method: 'GET',
            headers: {
              'X-Requested-With': 'XMLHttpRequest',
              'Accept': 'application/json'
            },
            credentials: 'same-origin',
          });


          if (response.ok) {
            const data = await response.json();

            if (data && data[sectionName]) {
              this.updateCollectionGrid(data[sectionName]);
              this.updateBrowserUrl(params);
              sectionsWorked = true;
            }
          } else {
            await response.text();
          }
        } catch {
          /* Section render request failed */
        }
      }

      // If section rendering didn't work, fall back to full page request
      if (!sectionsWorked) {

        // Remove sections parameter for full page request
        const fullPageUrl = new URL(currentUrl);
        fullPageUrl.searchParams.delete('sections');


        const fullResponse = await fetch(fullPageUrl.toString(), {
          method: 'GET',
          headers: {
            'X-Requested-With': 'XMLHttpRequest'
          },
          credentials: 'same-origin',
        });

        if (!fullResponse.ok) {
          console.error(`Full page request failed! status: ${fullResponse.status}`);
          throw new Error(`HTTP error! status: ${fullResponse.status}`);
        }

        const html = await fullResponse.text();

        // Parse the HTML and extract the section
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const newSection = doc.querySelector('[data-filter-grid]');


        if (newSection) {
          this.updateCollectionGrid(newSection.outerHTML);
          this.updateBrowserUrl(params);
        } else {
          // Try alternative selectors
          const altSection = doc.querySelector('section[id*="collection"]') || doc.querySelector('section[id*="search"]');

          if (altSection) {
            this.updateCollectionGrid(altSection.outerHTML);
            this.updateBrowserUrl(params);
          } else {
            console.warn("❌ Could not find any suitable section in full page response");
            this.hideLoadingState();
          }
        }
      }
    } catch (error) {
      console.error("Filter request failed:", error);
      this.hideLoadingState();
    }
  }

  updateBrowserUrl(params) {

    // Update URL without page reload (clean URL without sections parameter)
    const newUrl = new URL(window.location.href);

    // Clear existing filter/search/sort/page parameters before rebuilding from form state.
    const keysToDelete = [];
    for (const [paramKey] of newUrl.searchParams) {
      if (
        paramKey === 'sort_by' ||
        paramKey === 'type' ||
        paramKey === 'q' ||
        paramKey === 'page' ||
        paramKey.startsWith('filter.')
      ) {
        keysToDelete.push(paramKey);
      }
    }
    keysToDelete.forEach((key) => {
      newUrl.searchParams.delete(key);
    });

    // Remove sections parameter (used for API calls only)
    newUrl.searchParams.delete('sections');


    // Add new filter parameters
    for (const [key, value] of params) {
      if (value && value.trim() !== '') {
        newUrl.searchParams.append(key, value);
      }
    }


    // Update the browser URL
    window.history.pushState({}, '', newUrl.toString());

  }

  clearLoadMoreState() {
    // Clear localStorage for any grid-load-more elements on the page
    try {
      const gridElements = document.querySelectorAll('grid-load-more');
      gridElements.forEach(element => {
        if (typeof element.clearStoredCount === 'function') {
          element.clearStoredCount();
        }
      });
    } catch (error) {
      console.warn('Failed to clear load more state:', error);
    }
  }

  showLoadingState() {
    const mount = this.getResultsOverlayMount();
    if (mount) {
      mount.classList.add(FILTER_RESULTS_PENDING_CLASS);
      mount.querySelector(".filter-loading-overlay")?.remove();
    }

    this.setFormInputsDisabled(true);

    const filterRoot = this.getFilterPointerRoot();
    if (filterRoot) filterRoot.style.pointerEvents = "none";
  }

  hideLoadingState() {
    const mount = this.getResultsOverlayMount();
    if (mount) {
      mount.classList.remove(FILTER_RESULTS_PENDING_CLASS);
      mount.querySelector(".filter-loading-overlay")?.remove();
    }

    this.setFormInputsDisabled(false);

    const filterRoot = this.getFilterPointerRoot();
    if (filterRoot) filterRoot.style.pointerEvents = "";
  }

  setFormInputsDisabled(disabled) {
    if (this.filterInputs) {
      this.filterInputs.forEach(input => {
        input.disabled = disabled;
      });
    }
  }

  getSectionName() {

    // Method 1: Find section by data-filter-grid element
    const sectionElement = document.querySelector('[data-filter-grid]');

    if (sectionElement) {
      const section = sectionElement.closest('section[id]');

      if (section && section.id) {
        // Remove 'shopify-section-' prefix if present
        const sectionId = section.id.replace(/^shopify-section-/, '');
        return sectionId;
      }
    }

    // Method 2: Check URL patterns
    const pathname = window.location.pathname;

    if (pathname.includes('/search')) {
      return 'template--search';
    } else if (pathname.includes('/collections/')) {
      return 'template--collection';
    }

    // Method 3: Try common section names by searching DOM
    const possibleSections = [
      'template--collection',
      'template--search',
      'collection',
      'search'
    ];

    for (const sectionName of possibleSections) {
      const variations = [
        `#${sectionName}`,
        `#shopify-section-${sectionName}`,
        `section[id="${sectionName}"]`,
        `section[id="shopify-section-${sectionName}"]`
      ];

      for (const selector of variations) {
        const element = document.querySelector(selector);
        if (element) {
          return sectionName;
        }
      }
    }

    console.warn("❌ Could not determine section name");
    return null;
  }

  /**
   * Replace grid markup (shared by string / section HTML paths).
   * Sets view-transition-name on the inner `[grid]` mount only (see `setFilterGridViewTransitionName`).
   */
  applyCollectionGridMarkup(html) {

    if (typeof html === "string") {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");
      const newSection =
        doc.querySelector("section[data-filter-grid]") || doc.querySelector("[data-filter-grid]");

      if (newSection) {
        const parent = this.collectionGrid.parentElement;
        this.collectionGrid.outerHTML = newSection.outerHTML;
        this.collectionGrid =
          parent.querySelector("[data-filter-grid]") || document.querySelector("[data-filter-grid]");
      } else {
        console.warn("Could not find data-filter-grid element in new HTML, using innerHTML fallback");
        this.collectionGrid.innerHTML = html;
      }
    } else {
      this.collectionGrid.innerHTML = html;
    }

    this.setFilterGridViewTransitionName();

    this.reinitializeComponents();
  }

  updateCollectionGrid(html) {
    if (!html || !this.collectionGrid) {
      console.warn("updateCollectionGrid: Missing html or collectionGrid", {
        html: !!html,
        collectionGrid: !!this.collectionGrid,
      });
      this.hideLoadingState();
      return;
    }

    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    const shouldScrollToGridTop = this.isMobileOrTabletViewport();
    const scheduleRestoreScroll = () => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (shouldScrollToGridTop) {
            window.scrollTo(0, this.getCollectionGridScrollTop());
            return;
          }
          window.scrollTo(scrollX, scrollY);
        });
      });
    };

    const useViewTransition = this.prefersFilterViewTransition();

    const run = () => {
      try {
        this.applyCollectionGridMarkup(html);
      } catch (error) {
        console.error("Failed to update collection grid:", error);
      } finally {
        this.hideLoadingState();
        if (!useViewTransition) {
          scheduleRestoreScroll();
        }
      }
    };

    if (useViewTransition) {
      this.setFilterGridViewTransitionName();
      document.documentElement.classList.add("filter-results-vt");
      try {
        const vt = document.startViewTransition(run);
        vt.finished.finally(() => {
          document.documentElement.classList.remove("filter-results-vt");
          scheduleRestoreScroll();
        });
      } catch (e) {
        document.documentElement.classList.remove("filter-results-vt");
        run();
        scheduleRestoreScroll();
      }
    } else {
      run();
    }
  }

  reinitializeComponents() {
    try {

      if (!this.collectionGrid) {
        console.warn("Cannot reinitialize: collectionGrid is null");
        return;
      }

      // Re-initialize any grid-load-more elements in the updated section
      const gridLoadMoreElements = this.collectionGrid.querySelectorAll('grid-load-more');

      gridLoadMoreElements.forEach((element, index) => {
        try {
          // Force re-initialization if not already connected
          if (!element.grid || !element.loadMoreBtn) {
            // Trigger connectedCallback manually
            if (typeof element.connectedCallback === 'function') {
              element.connectedCallback();
            }
          }
        } catch (elemError) {
          console.warn(`Failed to reinitialize grid-load-more element ${index + 1}:`, elemError);
        }
      });

      // Re-initialize price range sliders
      const priceRangeElements = this.collectionGrid.querySelectorAll('price-range-slider');

      priceRangeElements.forEach((element, index) => {
        try {
          if (!element.rangeInputs || element.rangeInputs.length === 0) {
            if (typeof element.connectedCallback === 'function') {
              element.connectedCallback();
            }
          }
        } catch (elemError) {
          console.warn(`Failed to reinitialize price-range-slider element ${index + 1}:`, elemError);
        }
      });

      // Re-initialize any custom-filter elements
      const customFilterElements = this.collectionGrid.querySelectorAll('custom-filter');

      customFilterElements.forEach((element, index) => {
        try {
          if (!element.control || !element.body) {
            if (typeof element.connectedCallback === 'function') {
              element.connectedCallback();
            }
          }
        } catch (elemError) {
          console.warn(`Failed to reinitialize custom-filter element ${index + 1}:`, elemError);
        }
      });

    } catch (error) {
      console.warn('❌ Failed to reinitialize components:', error);
    }
  }

  attachSelectedFilterListeners() {
    if (!this.collectionGrid) {
      return;
    }

    const selectedFilterButtons = document.querySelectorAll('[selected-filter], .selected-filter[data-param-remove]');

    selectedFilterButtons.forEach((selected) => {
      if (selected.dataset.selectedFilterBound === 'true') {
        return;
      }

      selected.dataset.selectedFilterBound = 'true';
      selected.addEventListener('click', (event) => {
        this.handleSelectedFilterRemoval(event);
      });
    });
  }

  attachResetFilterListener() {
    if (!this.resetFilters.length || !this.collectionGrid) return;

    this.resetFilters.forEach((resetButton) => {
      if (resetButton.dataset.resetFiltersBound === 'true') return;
      resetButton.dataset.resetFiltersBound = 'true';
      resetButton.addEventListener('click', (event) => {
        event.preventDefault();
        this.handleResetFilters();
      });
    });
  }

  async handleResetFilters() {
    if (!this.filterForm) return;

    const resettableFields = this.filterForm.querySelectorAll('input, select, textarea');

    resettableFields.forEach((field) => {
      const name = field.name || '';
      const shouldKeepField = name === 'sort_by' || name === 'q' || name === 'type';

      if (shouldKeepField || field.disabled) return;

      switch (field.type) {
        case 'checkbox':
        case 'radio':
          field.checked = false;
          break;
        case 'select-one':
          field.selectedIndex = 0;
          break;
        case 'select-multiple':
          Array.from(field.options).forEach((option) => {
            option.selected = false;
          });
          break;
        default:
          field.value = '';
      }
    });

    await this.handleFilterChange();
  }

  async handleSelectedFilterRemoval(event) {
    event.preventDefault();

    const selectedFilterButton = event.currentTarget;
    const paramRemoveString = selectedFilterButton?.getAttribute('data-param-remove');

    if (!paramRemoveString) {
      return;
    }

    this.clearLoadMoreState();
    this.showLoadingState();

    try {
      const currentUrl = new URL(window.location.href);
      const paramsToRemove = new URLSearchParams(paramRemoveString);

      paramsToRemove.forEach((value, key) => {
        this.removeSearchParamByValue(currentUrl.searchParams, key, value);
      });

      // Ensure we return to the first page after removing filters.
      currentUrl.searchParams.delete('page');

      await this.fetchAndRenderFromUrl(currentUrl);

      currentUrl.searchParams.delete('sections');
      window.history.pushState({}, '', currentUrl.toString());
    } catch (error) {
      console.error('Failed to remove selected filter:', error);
      this.hideLoadingState();
    }
  }

  removeSearchParamByValue(searchParams, key, valueToRemove) {
    const existingValues = searchParams.getAll(key);

    if (!existingValues.length) {
      return;
    }

    searchParams.delete(key);

    if (!valueToRemove || valueToRemove === '') {
      return;
    }

    existingValues.forEach((value) => {
      if (value !== valueToRemove) {
        searchParams.append(key, value);
      }
    });
  }

  async fetchAndRenderFromUrl(requestUrl) {
    const sectionName = this.getSectionName();
    const requestWithSection = new URL(requestUrl.toString());

    if (sectionName) {
      requestWithSection.searchParams.set('sections', sectionName);
    }

    const isLocalDev = window.location.hostname === '127.0.0.1' ||
      window.location.hostname === 'localhost' ||
      window.location.port !== '';

    let sectionsWorked = false;

    if (sectionName && !isLocalDev) {
      try {
        const response = await fetch(requestWithSection.toString(), {
          method: 'GET',
          headers: {
            'X-Requested-With': 'XMLHttpRequest',
            Accept: 'application/json',
          },
          credentials: 'same-origin',
        });

        if (response.ok) {
          const data = await response.json();
          if (data && data[sectionName]) {
            this.updateCollectionGrid(data[sectionName]);
            sectionsWorked = true;
          }
        }
      } catch (error) {
        console.warn('Section render request failed during selected filter removal:', error);
      }
    }

    if (!sectionsWorked) {
      const fullPageUrl = new URL(requestWithSection.toString());
      fullPageUrl.searchParams.delete('sections');

      const fullResponse = await fetch(fullPageUrl.toString(), {
        method: 'GET',
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
        },
        credentials: 'same-origin',
      });

      if (!fullResponse.ok) {
        throw new Error(`HTTP error! status: ${fullResponse.status}`);
      }

      const html = await fullResponse.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const newSection = doc.querySelector('[data-filter-grid]');
      const altSection = doc.querySelector('section[id*="collection"]') || doc.querySelector('section[id*="search"]');

      if (newSection) {
        this.updateCollectionGrid(newSection.outerHTML);
      } else if (altSection) {
        this.updateCollectionGrid(altSection.outerHTML);
      } else {
        throw new Error('Could not find suitable section in full page response');
      }
    }
  }

}

customElements.define('filter-container', Filters);