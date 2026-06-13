const DOM_READY = new Promise((resolve) => {
  if (typeof document === "undefined") {
    resolve();
    return;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => resolve(), { once: true });
  } else {
    resolve();
  }
});

function matchesSelector(selector, root = document) {
  if (!selector || typeof root === "undefined" || root === null) return false;

  if (typeof selector === "string") {
    try {
      return !!root.querySelector(selector);
    } catch (error) {
      console.warn("theDomWatcher: invalid selector provided", selector, error);
      return false;
    }
  }

  if (typeof selector === "function") {
    try {
      return !!selector(root);
    } catch (error) {
      console.warn("theDomWatcher: selector predicate failed", error);
      return false;
    }
  }

  if (typeof Element !== "undefined" && selector instanceof Element) {
    return true;
  }

  return false;
}

function getObserverTarget(preferredTarget, rootCandidate, fallbackDocument) {
  const isNode = (value) => typeof Node !== "undefined" && value instanceof Node;
  const candidates = [
    preferredTarget,
    rootCandidate && rootCandidate.body ? rootCandidate.body : rootCandidate,
    fallbackDocument ? fallbackDocument.body || fallbackDocument : null,
    typeof document !== "undefined" ? document.body || document : null,
  ];

  return candidates.find((candidate) => isNode(candidate)) || null;
}

function evaluateSelectors(selectors, root) {
  if (!selectors.length) {
    return {
      hasMatch: true,
      matchedSelectors: [],
      selectorMatches: [],
    };
  }

  const selectorMatches = selectors.map((selector) => ({
    selector,
    matched: matchesSelector(selector, root),
  }));

  const matchedSelectors = selectorMatches
    .filter(({ matched }) => matched)
    .map(({ selector }) => selector);

  return {
    hasMatch: matchedSelectors.length > 0,
    matchedSelectors,
    selectorMatches,
  };
}

/**
 * Dynamically loads/executes logic only when matching selectors exist in the DOM.
 * @param {string|string[]|Function} selectors - CSS selector(s) or predicate checked against the DOM.
 * @param {Function} loader - Function that runs (or imports a module) when a selector matches.
 * @param {Object} [options]
 * @param {Document|Element} [options.root=document] - Limit the lookup scope.
 * @returns {Promise<unknown|false>} Resolves to loader result or false if nothing matched.
 */
export function theDomWatcher(
  selectors,
  loader,
  { root = document, label, observe = false, observerTarget } = {},
) {
  if (typeof loader !== "function") {
    console.warn("theDomWatcher: loader must be a function");
    return Promise.resolve(false);
  }

  const selectorList = Array.isArray(selectors) ? selectors : [selectors];
  const cleanedSelectors = selectorList.filter(Boolean);
  const debugLabel =
    label || (cleanedSelectors.length ? cleanedSelectors.join(", ") : "anonymous-loader");
  const observerRoot = getObserverTarget(observerTarget, root, document);

  return DOM_READY.then(() => {
    const runLoader = (reason) =>
      Promise.resolve()
        .then(loader)
        .catch((error) => {
          console.error("theDomWatcher: loader execution failed", error);
          return false;
        })
        .then((result) => {
          return result;
        });

    const attemptLoad = (reasonLabel) => {
      const { hasMatch, matchedSelectors } = evaluateSelectors(cleanedSelectors, root);
      if (!hasMatch) return null;

      const matched = matchedSelectors.length ? matchedSelectors : "(none, default)";
      // console.info(`[theDomWatcher] ${debugLabel}: ${reasonLabel}`, matched);

      return runLoader(reasonLabel);
    };

    const initialAttempt = attemptLoad("matched selectors");
    if (initialAttempt) {
      return initialAttempt;
    }

    if (!observe) {
      if (cleanedSelectors.length) {
        // console.info(
        //   `[theDomWatcher] ${debugLabel}: selectors not found, skipping`,
        //   cleanedSelectors
        // );
      }
      return false;
    }

    if (!observerRoot) {
      console.warn(`[theDomWatcher] ${debugLabel}: observe enabled but no observer root available`);
      return false;
    }

    // console.info(
    //   `[theDomWatcher] ${debugLabel}: selectors not found, observing for future matches`,
    //   cleanedSelectors
    // );

    return new Promise((resolve) => {
      const observer = new MutationObserver(() => {
        const result = attemptLoad("matched selectors (async)");
        if (result) {
          observer.disconnect();
          Promise.resolve(result).then(resolve);
        }
      });

      observer.observe(observerRoot, { childList: true, subtree: true });
    });
  });
}

export function whenDomReady() {
  return DOM_READY;
}

// Shows already-subscribed message after redirect
export function handleNewsletterSubscribed() {
  const live_url = window.location.href;
  const formNewsletter = document.querySelector("form.newsletter-form");
  const result = live_url.includes("form_type=customer");
  const input = document.querySelector("[newsletter-email-input]");

  if (input && formNewsletter) {
    const already_subscribed_text = input.getAttribute("data-already-subscribed");
    const input_val = input.value.length;
    if (result && input_val !== 0) {
      const add_el = document.createElement("h3");
      add_el.innerText = already_subscribed_text;
      formNewsletter.appendChild(add_el);
      add_el.classList.add(
        "newsletter_already_subscribe",
        "newsletter-form__message",
        "form__message",
      );
    }
  }
}

// Tracks signup via Klaviyo
export function trackNewsletterSignup() {
  const emailInput = document.querySelector('input[name="contact[email]"]');
  if (!emailInput) return;

  const debounce = (fn, delay) => {
    let timeout;
    return (...args) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => fn.apply(this, args), delay);
    };
  };

  const handleEmailInput = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (email && emailRegex.test(email)) {
      try {
        if (typeof klaviyo !== "undefined" && klaviyo.identify) {
          klaviyo.identify({ email });
        } else {
          console.warn("Klaviyo is not available on the site.");
        }
      } catch (error) {
        console.error("Error identifying user with Klaviyo:", error);
      }
    }
  };

  emailInput.addEventListener(
    "input",
    debounce((e) => handleEmailInput(e.target.value), 500),
  );
  emailInput.addEventListener("blur", (e) => handleEmailInput(e.target.value));
}

export function initProductDescriptions() {
  document.body.addEventListener("click", (e) => {
    if (e.target.classList.contains("read-more")) {
      const el = e.target;
      const container = el.closest("[read-more-container]");

      if (el.classList.contains("active")) {
        el.classList.remove("active");
        container.classList.remove("active");
        if (el.dataset.readMoreText) {
          el.innerHTML = el.dataset.readMoreText;
        }
      } else {
        el.classList.add("active");
        container.classList.add("active");
        if (el.dataset.readLessText) {
          el.innerHTML = el.dataset.readLessText;
        }
      }
    }
  });
}
