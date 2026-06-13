/*
- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
|       Wishlist Module
- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
|
|        -== TO DO LIST ==-
|           * Add tabs and the ability to swap between (All and individual wishlists)
|           * Add the ability to CLEAR a wishlist
|           * Add the ability to DELETE a wishlist
|
- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
*/

import { toasty } from "@theme/toasty";

export class Wishlist {
  constructor() {
    this.LOCAL_STORAGE_CLIENT_NAME = window.Shopify.shop.replace(/.myshopify.com/g, "");
    this.LOCAL_STORAGE_KEY = this.LOCAL_STORAGE_CLIENT_NAME + "__Wishlist";
    this.LOCAL_WISHLIST = localStorage.getItem(this.LOCAL_STORAGE_KEY);

    // JSON Object Temporary Storage
    this.TEMP_JSON_STORAGE_KEY = this.LOCAL_STORAGE_CLIENT_NAME + "__Wishlist_Temp";
    this.TEMP_JSON_STORAGE = localStorage.getItem(this.TEMP_JSON_STORAGE_KEY);

    this.BUTTON_ACTIVE_CLASS = "active-wishlist";
    this.PRODUCT_CARD = "product-card";
    this.PRODUCT_CARD_JSON = "data-product-json";
    this.WISHLIST_HEART = "wishlist-button";
    this.GRID_LOADED_ATTRIBUTE = "loaded";

    // Get Translations from Window Object
    this.translations = window.WishlistTranslations;

    // Developer Wishlist Settings
    this.settings = {
      allowMultipleLists: false,
      allowHeartAnimation: true,
      showNotifications: false,
    };

    this.selectors = {
      button: "[wishlist-button]",
      clearWishlist: ".clear-wishlist",
      wishlistGrid: "[wishlist-grid]",
      gridContainer: ".wishlist-grid-container",
      sideCartWishlistGrid: "[side-cart-wishlist-grid]",
      productCard: ".product-card",
      wishlistCount: "[wishlist-counter]",
      emptyWishlist: ".empty-wishlist",
      wishlistModal: "wishlist-choose-modal-wrapper",
      modalContent: "modal-content",
      wishlistTab: "[wishlist-tab]",
    };

    this.wishlists = [];

    this.wishlists.push({
      uuid: "uuid_1",
      title: "Default",
      items: [],
    });

    this.init();
  }

  init() {
    // Create Wishlist localStorage if does not exist
    if (this.LOCAL_WISHLIST === null)
      localStorage.setItem(this.LOCAL_STORAGE_KEY, JSON.stringify(this.wishlists));
    if (this.TEMP_JSON_STORAGE === null) localStorage.setItem(this.TEMP_JSON_STORAGE_KEY, []);
    this.LOCAL_WISHLIST = localStorage.getItem(this.LOCAL_STORAGE_KEY);

    // Set Wishlist Hearts Active Class
    this.updateWishlistHearts();

    // Populate all wishlist grids
    this.renderWishlist();

    // Event Listeners
    document.body.addEventListener("click", this.handleEvent.bind(this));
    this.wishlistMutationObserver();
  }

  handleEvent(e) {
    // e.preventDefault();
    this.wishlistHeartClick(e);

    if (this.settings.allowMultipleLists === true) {
      this.handleWishlistTabClick(e);
    }
  }

  /*
   ** This is used to automatically update new Product Cards active/inactive
   ** status as they are added to the DOM.
   */
  wishlistMutationObserver() {
    const targetToObserve = document.body;
    const config = { childList: true, subtree: true };

    const delay = 500;
    let mutationTimeout;
    let updateScheduled = false;

    const callback = (mutationsList, observer) => {
      let shouldUpdate = false;
      for (const mutation of mutationsList) {
        if (mutation.type === "childList") {
          for (const addedNode of mutation.addedNodes) {
            if (addedNode.nodeType !== Node.ELEMENT_NODE) {
              continue;
            } else if (
              addedNode.matches(this.selectors.button) ||
              addedNode.querySelector(this.selectors.button)
            ) {
              shouldUpdate = true;
            }
          }
        }
      }

      // clearTimeout( mutationTimeout );
      if (shouldUpdate && !updateScheduled) {
        updateScheduled = true;

        mutationTimeout = setTimeout(() => {
          this.updateWishlistHearts();
          updateScheduled = false;
        }, delay);
      }
    };

    const observer = new MutationObserver(callback);
    observer.observe(targetToObserve, config);
  }

  getWishlist(uuid) {
    const wishlists = JSON.parse(localStorage.getItem(this.LOCAL_STORAGE_KEY));
    const wishlist = wishlists.find((wishlist) => wishlist.uuid === uuid);

    if (wishlist) return wishlist;
    else return false;
  }

  wishlistHeartClick(e) {
    if (e.target.hasAttribute(this.WISHLIST_HEART)) {
      e.preventDefault();
      const wishlistHeart = e.target;
      const handle = wishlistHeart.getAttribute("data-product-handle");
      let allWishlistItems = this.getAllUniqueHandles(JSON.parse(this.LOCAL_WISHLIST));
      let doesHandleExist = allWishlistItems.some((item) => item.handle === handle);

      const default_uuid = "uuid_1";
      if (doesHandleExist) {
        if (this.settings.allowMultipleLists === true) {
          this.openWishlistModal(handle, "remove");
        } else {
          this.removeFromWishlist(default_uuid, handle);
        }
      } else {
        if (this.settings.allowMultipleLists === true) {
          this.openWishlistModal(handle, "add");
        } else {
          this.addToWishlist(default_uuid, handle);
        }
        this.lastWishlistHeartClicked = wishlistHeart;
      }
    }
  }

  isHandleExist(wishlist, handle) {
    return wishlist.items.some((item) => item.handle === handle);
  }

  async addToWishlist(uuid, handle, variant_id = null) {
    // Get Wishlist Array
    const wishlistJSON = JSON.parse(this.LOCAL_WISHLIST);
    const wishlist = this.getWishlist(uuid);

    //Get Wishlist Index
    let wishlistIndex = wishlistJSON.findIndex((wishlist) => wishlist.uuid === uuid);

    this.getProductJSON(handle).then((wishlist_item) => {
      if (!this.isHandleExist(wishlist, wishlist_item.handle)) {
        // Add Variant ID
        if (variant_id !== null) wishlist_item["selected_variant"] = variant_id;
        else wishlist_item["selected_variant"] = null;

        wishlistJSON[wishlistIndex].items.push(wishlist_item);

        // Update localStorage
        localStorage.setItem(this.LOCAL_STORAGE_KEY, JSON.stringify(wishlistJSON));
        this.LOCAL_WISHLIST = localStorage.getItem(this.LOCAL_STORAGE_KEY);

        // Toast
        if (this.settings.showNotifications === true) {
          let options = {
            // title: "Wishlist Item Added",
            title: `${this.translations.notifications.item_added}`,
            background: "#E4405F",
            // message: `${ wishlist_item.title } has been added to the wishlist`,
            message: `${wishlist_item.title} ${this.translations.notifications.item_added.subtext}`,
            delay: 3000,
          };
          toasty.addToast(options);
        }
      } else {
        return;
      }
      this.updateWishlistHearts();
      this.renderWishlist();
    });
  }

  removeFromWishlist(uuid, handle) {
    // Get Wishlist Array
    const wishlistJSON = JSON.parse(this.LOCAL_WISHLIST);
    const wishlist = this.getWishlist(uuid);
    let new_wishlist;

    //Get Wishlist Index
    let wishlistIndex = wishlistJSON.findIndex((wishlist) => wishlist.uuid === uuid);

    if (this.isHandleExist(wishlist, handle)) {
      const wishlist_item = wishlistJSON[wishlistIndex].items.find(
        (wishlist_item) => wishlist_item.handle === handle,
      );
      new_wishlist = wishlistJSON[wishlistIndex].items.filter((item) => item.handle !== handle);
      wishlistJSON[wishlistIndex].items = new_wishlist;

      // Update localStorage
      localStorage.setItem(this.LOCAL_STORAGE_KEY, JSON.stringify(wishlistJSON));
      this.LOCAL_WISHLIST = localStorage.getItem(this.LOCAL_STORAGE_KEY);

      if (this.settings.showNotifications === true) {
        // Toast
        let options = {
          // title: "Wishlist Item Removed",
          title: `${this.translations.notifications.item_removed}`,
          background: "#E4405F",
          // message: `${ wishlist_item.title } has been removed from the wishlist`,
          message: `${wishlist_item.title} ${this.translations.notifications.item_removed_subtext}`,
          delay: 3000,
        };
        toasty.addToast(options);
      }
    } else {
      return;
    }
    this.updateWishlistHearts();
    this.renderWishlist();
  }

  removeFromAllWishlists(handle) {
    // Get Wishlist Array
    const wishlistJSON = JSON.parse(this.LOCAL_WISHLIST);
    let itemRemoved = false;

    // Iterate through all wishlists and remove the handle
    wishlistJSON.forEach((wishlist, index) => {
      if (this.isHandleExist(wishlist, handle)) {
        wishlistJSON[index].items = wishlist.items.filter((item) => item.handle !== handle);
        itemRemoved = true;
      }
    });

    if (itemRemoved) {
      // Update localStorage
      localStorage.setItem(this.LOCAL_STORAGE_KEY, JSON.stringify(wishlistJSON));
      this.LOCAL_WISHLIST = localStorage.getItem(this.LOCAL_STORAGE_KEY);

      // Update UI
      this.updateWishlistHearts();
      this.renderWishlist();
    }
  }

  // States:  add | remove | create
  openWishlistModal(handle, state) {
    const wishlist_lists = JSON.parse(this.LOCAL_WISHLIST);
    const wishlistModal = document.querySelector(`.${this.selectors.wishlistModal}`);
    const tabContainer = wishlistModal.querySelector(".wishlist-list-container");

    let tabs = document.createElement("div");

    wishlistModal.setAttribute("data-selected-product", handle);

    if (wishlistModal) {
      // const chooseModal = wishlistModal.querySelector(`.${this.selectors.modalContent}.choose`);
      // const createModal = wishlistModal.querySelector(`.${this.selectors.modalContent}.create`);

      wishlistModal.classList.remove("add", "remove", "create");
      wishlistModal.classList.add("active", state);
      wishlistModal.setAttribute("aria-hidden", "false");

      // Modal Content Data
      let modal_content_data = {
        add: {
          // "title": "Add to Wishlist",
          // "description": "Choose or create a list to add the item to"
          title: `${this.translations.modal.add.title}`,
          description: `${this.translations.modal.add.description}`,
        },
        remove: {
          // "title": "Remove from Wishlist",
          // "description": "Choose a list to remove the item from"
          title: `${this.translations.modal.remove.title}`,
          description: `${this.translations.modal.remove.description}`,
        },
      };

      // Function to help update Modal Content
      function updateContent(state) {
        const updateModalContent = wishlistModal.querySelector(".modal-content.update");
        const title = updateModalContent.querySelector(".modal-title");
        const description = updateModalContent.querySelector(".modal-description");

        if (title) title.innerHTML = modal_content_data[state].title;
        if (description) description.innerHTML = modal_content_data[state].description;
      }

      if (state === "add") {
        updateContent(state);

        wishlist_lists.forEach((wishlist) => {
          if (!wishlist.items.find((item) => item.handle === handle)) {
            const tab = this.generateWishlistTab(wishlist);
            tabs.append(tab);
          }
        });
      } else if (state === "remove") {
        updateContent(state);

        wishlist_lists.forEach((wishlist) => {
          if (wishlist.items.find((item) => item.handle === handle)) {
            const tab = this.generateWishlistTab(wishlist);
            tabs.append(tab);
          }
        });
      }

      tabContainer.innerHTML = tabs.innerHTML;

      // Show Modal
      wishlistModal.classList.add("active");
    } else {
      // console.log("Choose modal does not exist, adding to default wishlist...")
      this.addToWishlist(wishlist_lists[0].uuid, handle);
    }
  }

  closeWishlistModal() {
    const wishlistModal = document.querySelector(`.${this.selectors.wishlistModal}`);
    if (wishlistModal) {
      wishlistModal.classList.remove("active");
      wishlistModal.setAttribute("aria-hidden", "true");
      wishlistModal.removeAttribute("data-selected-product");
    }
  }

  handleWishlistTabClick(e) {
    const wishlists = JSON.parse(this.LOCAL_WISHLIST);
    const wishlistModal = document.querySelector(`.${this.selectors.wishlistModal}`);
    const target = e.target;
    const wishlistTab = target.closest(this.selectors.wishlistTab);
    const wishlistCreateTab = target.closest(".create-list");
    const wishlistCreateSubmit = target.closest(".create-btn");
    const selectedProduct = wishlistModal.getAttribute("data-selected-product");

    if (wishlistTab && selectedProduct) {
      const selectedWishlist = wishlistTab.getAttribute("data-wishlist-uuid");

      if (wishlistModal.classList.contains("add")) {
        this.addToWishlist(selectedWishlist, selectedProduct);
      } else if (wishlistModal.classList.contains("remove")) {
        this.removeFromWishlist(selectedWishlist, selectedProduct);
      }

      wishlistModal.removeAttribute("data-selected-product");
      this.closeWishlistModal();
    } else if (wishlistCreateTab) {
      wishlistModal.classList.remove("add", "remove");
      wishlistModal.classList.add("create");
    } else if (wishlistCreateSubmit) {
      const nameInput = wishlistModal.querySelector("input.create-list-name");

      this.createWishlist(nameInput.value);

      const updatedWishlist = JSON.parse(this.LOCAL_WISHLIST);
      this.addToWishlist(updatedWishlist[updatedWishlist.length - 1].uuid, selectedProduct);
      // console.log('updatedWishlist: ', updatedWishlist, ' | new wishlist: ', updatedWishlist[ updatedWishlist.length - 1 ])

      this.closeWishlistModal();
    } else if (e.target.classList.contains(this.selectors.wishlistModal)) {
      this.closeWishlistModal();
    }
  }

  generateWishlistTab(wishlist_list) {
    const wishlist_uuid = wishlist_list.uuid;
    const wishlist_title = wishlist_list.title;
    const wishlist_count = wishlist_list.items.length + " wishlist items";
    const wishlist_img =
      wishlist_list.items.length > 0 ? wishlist_list.items[0].featured_img : null;

    // Create Element
    const node = document.createElement("div");
    node.classList.add("wishlist-list-option");
    node.setAttribute("wishlist-tab", "wishlist-tab");
    node.setAttribute("data-wishlist-uuid", wishlist_uuid);

    // Create Featured Image
    let img;
    if (wishlist_img !== null) {
      img = new Image();
      img.src = wishlist_img;
    } else {
      // Placeholder SVG (Fallback)
      img = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      img.setAttribute("viewBox", "0 0 104 104");
      img.style.fill = "currentColor";

      const img_path_1 = document.createElementNS("http://www.w3.org/2000/svg", "path");
      img_path_1.setAttribute(
        "d",
        "M95.75 12.6691L91.3309 8.25L8.25 91.3309L12.6691 95.75L18.9191 89.5H83.25C84.9069 89.4978 86.4953 88.8386 87.667 87.667C88.8386 86.4953 89.4978 84.9069 89.5 83.25V18.9191L95.75 12.6691ZM83.25 83.25H25.1691L49.5219 58.8969L56.9556 66.3303C58.1277 67.5024 59.7174 68.1609 61.375 68.1609C63.0326 68.1609 64.6223 67.5024 65.7944 66.3303L70.75 61.375L83.25 73.8666V83.25ZM83.25 65.0256L75.1694 56.9447C73.9973 55.7726 72.4076 55.1141 70.75 55.1141C69.0924 55.1141 67.5027 55.7726 66.3306 56.9447L61.375 61.9006L53.9469 54.4722L83.25 25.1691V65.0256Z",
      );
      img_path_1.style.fill = "currentColor";

      const img_path_2 = document.createElementNS("http://www.w3.org/2000/svg", "path");
      img_path_2.setAttribute(
        "d",
        "M20.75 70.75V61.375L36.375 45.7606L40.6666 50.0522L45.0912 45.6272L40.7944 41.3303C39.6223 40.1582 38.0326 39.4998 36.375 39.4998C34.7174 39.4998 33.1277 40.1582 31.9556 41.3303L20.75 52.5363V20.75H70.75V14.5H20.75C19.0929 14.5017 17.5042 15.1607 16.3324 16.3324C15.1607 17.5042 14.5017 19.0929 14.5 20.75V70.75H20.75Z",
      );
      img_path_2.style.fill = "currentColor";

      img.appendChild(img_path_1);
      img.appendChild(img_path_2);
    }
    const img_node = document.createElement("div");
    img_node.classList.add("image");
    if (img) img_node.appendChild(img);

    // Add Text Content
    const content_node = document.createElement("div");
    content_node.classList.add("content");

    // Title
    const title_node = document.createElement("div");
    title_node.classList.add("title");
    title_node.textContent = wishlist_title;

    // Count
    const count_node = document.createElement("div");
    count_node.classList.add("wishlist-count");
    count_node.textContent = wishlist_count;

    content_node.appendChild(title_node);
    content_node.appendChild(count_node);

    // Create SVG
    const chevron_svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    chevron_svg.classList.add("chevron");
    chevron_svg.setAttribute("viewBox", "0 0 15.403 8.806");
    const chevron_path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    chevron_path.setAttribute(
      "d",
      "M6.152,7.7.323,1.876A1.1,1.1,0,0,1,1.882.322l6.6,6.6a1.1,1.1,0,0,1,.032,1.518L1.887,15.082A1.1,1.1,0,0,1,.328,13.528Z",
    );
    chevron_path.setAttribute("transform", "translate(15.403) rotate(90)");
    chevron_svg.appendChild(chevron_path);

    // Add SVG to Node
    node.appendChild(img_node);
    node.appendChild(content_node);
    node.appendChild(chevron_svg);

    return node;
  }

  createWishlist(name) {
    const wishlists = JSON.parse(this.LOCAL_WISHLIST);
    const uuid = "uuid_" + (wishlists.length + 1);

    const new_list = {
      uuid: uuid,
      title: name,
      items: [],
    };

    wishlists.push(new_list);
    localStorage.setItem(this.LOCAL_STORAGE_KEY, JSON.stringify(wishlists));
    this.LOCAL_WISHLIST = localStorage.getItem(this.LOCAL_STORAGE_KEY);
  }

  updateWishlistCount() {
    const wishlistCounters = document.querySelectorAll(this.selectors.wishlistCount);
    this.WISHLIST_ITEM_COUNT = this.getAllUniqueHandles(JSON.parse(this.LOCAL_WISHLIST)).length;
    const wishlistItemCount = this.WISHLIST_ITEM_COUNT ? parseInt(this.WISHLIST_ITEM_COUNT) : 0;

    if (wishlistCounters) {
      wishlistCounters.forEach((wishlistCounter) => {
        if (wishlistItemCount > 0) {
          wishlistCounter.innerHTML = wishlistItemCount;
          wishlistCounter.classList.remove("hidden");
        } else {
          wishlistCounter.innerHTML = 0;
          wishlistCounter.classList.add("hidden");
        }
      });
    }
  }

  updateWishlistHearts() {
    // Get all Wishlist Items from all Wishlists
    if (this.LOCAL_WISHLIST) {
      let allWishlistItems = this.getAllUniqueHandles(JSON.parse(this.LOCAL_WISHLIST));
      const allWishlistHearts = document.querySelectorAll(this.selectors.button);

      // Remove active class
      allWishlistHearts.forEach((wishlistHeart) => {
        wishlistHeart.classList.remove(this.BUTTON_ACTIVE_CLASS);
        wishlistHeart.removeAttribute("loading");
      });

      // Update all Wishlist Hearts
      allWishlistItems.forEach((wishlistItem) => {
        const product_id = wishlistItem.product_id;
        const wishlistHearts = document.querySelectorAll(
          ` ${this.selectors.button}[data-product-id='${product_id}'] `,
        );
        wishlistHearts.forEach((wishlistHeart) => {
          wishlistHeart.classList.add(this.BUTTON_ACTIVE_CLASS);
        });
      });

      this.updateWishlistCount();
    } else {
      // console.log('this.LOCAL_WISHLIST does not exist')
    }
  }

  getAllUniqueHandles(wishlists) {
    let allWishlistItems = wishlists.flatMap((uuidObj) => uuidObj.items);
    // console.log('allWishlistItems', allWishlistItems);
    const uniqueWishlistItems = allWishlistItems.filter(
      (item, index, self) => index === self.findIndex((obj) => obj.handle === item.handle),
    );
    // console.log('Unique Wishlist Items by Handle', uniqueWishlistItems);
    return uniqueWishlistItems;
  }

  async renderWishlist() {
    const wishlistGrids = document.querySelectorAll(
      ` ${this.selectors.wishlistGrid}, ${this.selectors.sideCartWishlistGrid} `,
    );
    const handles = this.getAllUniqueHandles(JSON.parse(this.LOCAL_WISHLIST)).map(
      (item) => item.handle,
    );

    if (wishlistGrids && wishlistGrids.length > 0) {
      console.log("wishlistGrids: ", wishlistGrids);

      if (handles.length > 0) {
        console.log("handles: ", handles);
        const products = await Promise.all(
          handles.map(async (productHandle) => {
            const productTileTemplateUrl =
              window.Shopify.routes.root +
              `products/${productHandle}?section_id=${this.PRODUCT_CARD}`;

            try {
              const response = await fetch(productTileTemplateUrl);
              if (!response.ok) throw new Error("Error: " + response.status);

              const data = await response.text();
              const htmlDocument = new DOMParser().parseFromString(data, "text/html");
              const productCard = htmlDocument.documentElement.querySelector(
                this.selectors.productCard,
              );

              if (productCard.dataset.productId !== "") {
                return productCard.outerHTML;
              } else {
                console.warn("Product card not found for:", productHandle);
                // remove these handles from the wishlist
                this.removeFromAllWishlists(productHandle);
                return null;
              }
            } catch (error) {
              console.error(error);
              return null;
            }
          }),
        );

        // Remove any null entries (failed fetches)
        const validProducts = products.filter((product) => product !== null);

        // Check if we have any valid products after filtering
        if (validProducts.length > 0) {
          // Insert the products into the grids
          wishlistGrids.forEach((grid) => {
            grid.innerHTML = validProducts.join("");
            grid.setAttribute(this.GRID_LOADED_ATTRIBUTE, "");
          });

          document.dispatchEvent(
            new CustomEvent("shopify-wishlist:init-product-grid", {
              detail: { wishlist: validProducts },
            }),
          );
        } else {
          // All products were invalid, show empty state
          console.log("All products were invalid, showing empty state");
          wishlistGrids.forEach((grid) => {
            const emptyMessage = grid.getAttribute("data-empty-message");
            const buttonMessage = grid.getAttribute("data-button-message");
            const buttonLink = grid.getAttribute("data-button-link");

            const emptyNode = document.createElement("div");
            emptyNode.classList.add(
              "flex-center",
              "flex-col",
              "align-center",
              "g-xs",
              "text-center",
            );
            emptyNode.classList.add("heading-sm", "empty-wishlist-message");
            emptyNode.innerHTML = '<h2 class="heading-h2">' + emptyMessage + "</h2>";

            const buttonNode = document.createElement("a");
            buttonNode.classList.add("button-1");
            buttonNode.innerHTML = buttonMessage;
            buttonNode.href = buttonLink;

            emptyNode.appendChild(buttonNode);

            grid.innerHTML = "";
            grid.append(emptyNode);

            grid.setAttribute(this.GRID_LOADED_ATTRIBUTE, "");
          });

          document.dispatchEvent(
            new CustomEvent("shopify-wishlist:init-product-grid", {
              detail: { wishlist: [] },
            }),
          );
        }
      } else {
        console.log("no products");
        wishlistGrids.forEach((grid) => {
          const emptyMessage = grid.getAttribute("data-empty-message");
          const buttonMessage = grid.getAttribute("data-button-message");
          const buttonLink = grid.getAttribute("data-button-link");

          const emptyNode = document.createElement("div");
          emptyNode.classList.add("flex-center", "flex-col", "align-center", "g-xs", "text-center");
          emptyNode.classList.add("heading-sm", "empty-wishlist-message");
          emptyNode.innerHTML = '<h2 class="heading-h2">' + emptyMessage + "</h2>";

          const buttonNode = document.createElement("a");
          buttonNode.classList.add("button-1");
          buttonNode.innerHTML = buttonMessage;
          buttonNode.href = buttonLink;

          emptyNode.appendChild(buttonNode);

          grid.innerHTML = "";
          grid.append(emptyNode);

          grid.setAttribute(this.GRID_LOADED_ATTRIBUTE, "");
        });

        document.dispatchEvent(
          new CustomEvent("shopify-wishlist:init-product-grid", {
            detail: { wishlist: handles },
          }),
        );
      }

      this.updateWishlistHearts();
    }
  }

  async getProductJSON(handle) {
    try {
      const response = await fetch(window.Shopify.routes.root + `products/${handle}.js`);

      if (!response.ok) {
        throw new Error("Error: " + response.status);
      }

      const json = await response.json();

      const wishlist_item_json = {
        title: json.title,
        product_id: json.id,
        handle: json.handle,
        variants: json.variants,
        price: json.price,
        featured_img: json.featured_image,
      };

      return wishlist_item_json;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }
}

export const wishlist = new Wishlist();
window.Wishlist = wishlist;
