/*
Cart prefetch (ES module)
Purpose: warm browser caches for cart-related script assets on first mouseenter / focus of the cart toggle.
- Reads its own <script data-assets="..."> attribute (no inline JS required).
- Uses import.meta.url to locate its script tag, falls back to scanning scripts with data-assets.
- Attaches one-time hover/focus listeners to '[data-open-cart],[open-side-cart],.openSideCart' across all matches.
- Guards with window.__theme_cart_prefetch_initiated so it runs only once for asset preloads; sections prefetch is also once-per-page.
- Minimal, dependency-free, and wrapped in try/catch so it never throws.
*/
(function () {
  "use strict";

  var SELECTOR = "[data-open-cart],[open-side-cart],.openSideCart";

  function getScriptTag() {
    try {
      // Prefer currentScript when available
      if (document.currentScript) return document.currentScript;

      // Derive filename from import.meta.url
      var myFile = "";
      try {
        myFile = new URL(import.meta.url).pathname.split("/").pop() || "";
      } catch (e) {
        myFile = "";
      }

      var candidates = document.querySelectorAll("script[data-assets]");
      for (var i = 0; i < candidates.length; i++) {
        var s = candidates[i];
        try {
          if (!s.src) continue;
          // Exact match first
          if (s.src === import.meta.url) return s;
          // Then match by filename
          if (myFile && s.src.indexOf(myFile) !== -1) return s;
        } catch (e) {
          /* noop */
        }
      }
      return candidates[0] || null;
    } catch (e) {
      return null;
    }
  }

  function parseAssets(attr) {
    try {
      if (!attr) return [];
      return attr
        .split(",")
        .map(function (s) {
          return s && s.trim();
        })
        .filter(Boolean);
    } catch (e) {
      return [];
    }
  }

  function prefetchAssets(assets) {
    try {
      if (window.__theme_cart_prefetch_initiated) return;
      window.__theme_cart_prefetch_initiated = true;

      assets.forEach(function (href) {
        try {
          var l = document.createElement("link");
          l.rel = "preload";
          l.as = "script";
          l.href = href;
          document.head.appendChild(l);
        } catch (e) {
          /* noop */
        }
      });

      assets.forEach(function (href) {
        try {
          var l = document.createElement("link");
          l.rel = "prefetch";
          l.as = "script";
          l.href = href;
          l.crossOrigin = "anonymous";
          document.head.appendChild(l);
        } catch (e) {
          /* noop */
        }
      });

      assets.forEach(function (href) {
        try {
          // Perform a best-effort fetch; if the response looks like a cart sections payload,
          // mark the global cart instance as having hydrated drawer/recommendations so openSideCart won't re-fetch.
          fetch(href, { method: "GET", credentials: "same-origin" })
            .then(function (resp) {
              try {
                if (!resp || !resp.ok) return;
                var url = resp.url || href;
                var contentType =
                  resp.headers && resp.headers.get ? resp.headers.get("content-type") || "" : "";
                // Heuristic: if the URL is the cart endpoint with sections, try to inspect JSON
                if (
                  contentType.indexOf("application/json") !== -1 &&
                  url &&
                  url.indexOf("cart") !== -1 &&
                  url.indexOf("sections") !== -1
                ) {
                  resp
                    .clone()
                    .json()
                    .then(function (data) {
                      try {
                        if (!window || !window.cart) return;
                        try {
                          window.cart.state = window.cart.state || {};
                        } catch (e) {
                          /* noop */
                        }
                        // QF-cart-prefetch-fix: mark drawer/recommendations as prefetched to avoid duplicate fetch on open
                        try {
                          window.cart.state.drawerHydrated = true;
                        } catch (e) {
                          /* noop */
                        }
                        // Store prefetched sections for potential reuse
                        try {
                          if (data && data.sections)
                            window.cart._prefetchedSections = data.sections;
                        } catch (e) {
                          /* noop */
                        }
                        // If recommendations markup was included, set a resolved import so getRecommendationsController won't re-import
                        try {
                          var hasRec =
                            (data &&
                              (data["cart-recommendations"] || data["cart_recommendations"])) ||
                            (data &&
                              data.sections &&
                              (data.sections["cart-recommendations"] ||
                                data.sections["cart_recommendations"]));
                          if (hasRec) {
                            if (!window.cart._recImport && !window.cart._recController) {
                              window.cart._recImport = Promise.resolve(null);
                            }
                          }
                        } catch (e) {
                          /* noop */
                        }
                      } catch (e) {
                        /* noop */
                      }
                    })
                    .catch(function () {
                      /* ignore parse errors */
                    });
                }
              } catch (e) {
                /* noop */
              }
            })
            .catch(function () {
              /* ignore fetch errors */
            });
        } catch (e) {
          /* noop */
        }
      });
    } catch (e) {
      /* noop */
    }
  }

  // QF-cart-prefetch-fix: actively prefetch cart sections on hover and hydrate drawer to avoid duplicate fetch on open
  function prefetchCartSections() {
    try {
      if (!window || !window.cart) return;
      if (window.__theme_cart_sections_prefetch_initiated) return;

      var sections = [];
      try {
        sections = window.cart.getDefaultSections({ includeRecommendations: true }) || [];
      } catch (e) {
        sections = [];
      }
      if (!sections.length) return;

      try {
        var url = new URL("cart", window.cart.root || window.location.origin + "/");
        url.searchParams.set("sections", sections.join(","));
      } catch (e) {
        return;
      }

      if (window.cart._prefetchPromise) {
        return window.cart._prefetchPromise;
      }

      window.__theme_cart_sections_prefetch_initiated = true;

      var p = fetch(url.toString(), {
        method: "GET",
        headers: { "X-Requested-With": "XMLHttpRequest" },
        credentials: "same-origin",
      })
        .then(function (resp) {
          if (!resp || !resp.ok) return null;
          var ct = resp.headers && resp.headers.get ? resp.headers.get("content-type") || "" : "";
          if (ct.indexOf("application/json") === -1) return null;
          return resp.json();
        })
        .then(function (data) {
          try {
            if (!data) return;
            var sectionsObj = data.sections || data;
            if (sectionsObj && window.cart && typeof window.cart.renderSections === "function") {
              window.cart.renderSections(sectionsObj, { reason: "prefetch" });
            }
            try {
              window.cart.state = window.cart.state || {};
            } catch (e) {
              /* noop */
            }
            try {
              window.cart.state.drawerHydrated = true;
            } catch (e) {
              /* noop */
            }
            try {
              window.cart._prefetchedSections = sectionsObj;
            } catch (e) {
              /* noop */
            }
            try {
              var hasRec = !!(
                sectionsObj &&
                (sectionsObj["cart-recommendations"] || sectionsObj["cart_recommendations"])
              );
              if (hasRec) {
                if (!window.cart._recImport && !window.cart._recController) {
                  window.cart._recImport = Promise.resolve(null);
                }
              }
            } catch (e) {
              /* noop */
            }
          } catch (e) {
            /* noop */
          }
          return data;
        })
        .catch(function () {
          /* ignore fetch errors */
        })
        .finally(function () {
          try {
            window.cart._prefetchPromise = null;
          } catch (e) {
            /* noop */
          }
        });

      try {
        window.cart._prefetchPromise = p;
      } catch (e) {
        /* noop */
      }
      return p;
    } catch (e) {
      /* noop */
    }
  }

  function attachOnce(selector, assets) {
    try {
      var triggers = document.querySelectorAll(selector);
      if (!triggers || !triggers.length) return;

      var handler = function () {
        try {
          prefetchAssets(assets);
        } catch (e) {
          /* noop */
        }
        try {
          prefetchCartSections();
        } catch (e) {
          /* noop */
        }
      };

      // Bind to all triggers one-time
      for (var i = 0; i < triggers.length; i++) {
        var el = triggers[i];
        if (!el) continue;
        // Mouse + keyboard
        try {
          el.addEventListener("mouseenter", handler, { once: true });
        } catch (e) {
          /* noop */
        }
        try {
          el.addEventListener("focus", handler, { once: true, capture: true });
        } catch (e) {
          /* noop */
        }
        // Touch / pointer devices: one-time listeners to warm cache on user interaction.
        // Using passive listeners where appropriate to avoid blocking responsiveness.
        try {
          el.addEventListener("pointerdown", handler, { once: true, passive: true });
        } catch (e) {
          /* noop */
        }
        try {
          el.addEventListener("touchstart", handler, { once: true, passive: true });
        } catch (e) {
          /* noop */
        }
      }
    } catch (e) {
      /* noop */
    }
  }

  function init() {
    try {
      if (typeof window.__theme_cart_prefetch_initiated === "undefined") {
        window.__theme_cart_prefetch_initiated = false;
      }
      if (typeof window.__theme_cart_sections_prefetch_initiated === "undefined") {
        window.__theme_cart_sections_prefetch_initiated = false;
      }

      var script = getScriptTag();
      var assets = script ? parseAssets(script.getAttribute("data-assets")) : [];
      // Proceed even if no assets; sections prefetch can still run

      var onReady = function () {
        try {
          attachOnce(SELECTOR, assets);
        } catch (e) {
          /* noop */
        }
      };

      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", onReady);
      } else {
        onReady();
      }
    } catch (e) {
      /* noop */
    }
  }

  init();
})();
