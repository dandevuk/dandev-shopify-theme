import Fuse from "@theme/fuse";

export function initFAQSearch() {
  const searchInput = document.querySelector("#fuse-search");
  const resetSearch = document.querySelector("#reset-search");
  const faqsSearchContainer = document.querySelector(".faqs-search-container");
  const faqsGridContainer = document.querySelector(".faqs-grid-container");
  const searchFaqElements = document.querySelectorAll(".faqs-search-container [data-faq-category]");

  if (!searchInput || !faqsSearchContainer || !searchFaqElements.length) return;

  const faqs = Array.from(searchFaqElements).map((el) => ({
    name: el.dataset.faqCategory,
    question: el.dataset.faqQuestion,
    element: el,
  }));

  let fuse = null;
  const getFuse = () =>
    (fuse ??= new Fuse(faqs, {
      keys: ["name", "question"],
      includeScore: true,
      threshold: 0.4,
    }));

  const debounce = (fn, delay = 150) => {
    let timeout;
    return (...args) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => fn(...args), delay);
    };
  };

  const handleSearch = () => {
    const query = searchInput.value.trim();

    if (query.length <= 3) {
      faqsGridContainer?.classList.remove("hidden");
      faqsSearchContainer.classList.add("hidden");
      searchFaqElements.forEach((el) => el.classList.remove("hidden"));
      return;
    }

    faqsGridContainer?.classList.add("hidden");
    faqsSearchContainer.classList.remove("hidden");

    const results = getFuse().search(query);
    searchFaqElements.forEach((el) => el.classList.add("hidden"));

    results
      .sort((a, b) => a.score - b.score)
      .forEach((result) => {
        const el = result.item.element;
        el.classList.remove("hidden");
        faqsSearchContainer.querySelector(".flex-col > div").appendChild(el);
      });
  };

  searchInput.addEventListener("input", debounce(handleSearch, 200));
  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleSearch();
    if (e.key === "Escape") {
      searchInput.value = "";
      handleSearch();
    }
  });

  resetSearch?.addEventListener("click", () => {
    searchInput.value = "";
    handleSearch();
    searchInput.focus();
  });

  faqsSearchContainer.classList.add("hidden");
}
