/**
 * DOM morphing — incremental update of a live DOM tree from a new tree.
 *
 * This module implements a "morph" (similar to morphdom / idom): given an existing
 * `oldTree` already in the document and a `newTree` (DOM node or HTML string), it
 * updates `oldTree` in place so it matches `newTree` while reusing as many existing
 * nodes as possible. That preserves:
 *   - JavaScript state on elements (event listeners, custom element internals)
 *   - Focus, scroll position, and form input values (with special handling)
 *   - Identity of nodes matched by tag, id, or custom keys
 *
 * Typical use in this theme: Section Rendering API returns fresh HTML; morph patches
 * the live section instead of replacing innerHTML (which would destroy state).
 *
 * High-level flow:
 *   morph() → either updateChildren() only (childrenOnly) or walk() from the root
 *   walk()  → compare node pairs; update attributes/text; recurse into children
 *   updateChildren() → sync child lists with insert/remove/replace and key lookahead
 */

/**
 * @typedef {Object} MorphOptions
 * @property {boolean} [childrenOnly] If true, only sync children of oldTree; root element is untouched.
 * @property {(node: Node | undefined) => string|number|undefined} [getNodeKey] Custom identity for matching siblings (default: element `id`).
 * @property {(oldNode: Node, newNode: Node) => void} [onBeforeUpdate] Hook before a node’s attributes/content are patched.
 * @property {(node: Node) => void} [onAfterUpdate] Hook after a node (and its subtree) has been updated.
 * @property {(oldNode: Node, newNode: Node) => boolean} [reject] If true, skip morphing this new child (removed from new tree during sync).
 */

/** Default options used when morph() is called without a third argument. */
/** @type {MorphOptions} */
const MORPH_OPTIONS = {
  // Theme default: morph section inner content only; the outer wrapper stays the same node.
  childrenOnly: true,

  /**
   * Nodes we never want to apply from server HTML — they add noise or break hydration.
   * Rejected nodes are removed from the *new* tree during child sync (see updateChildren).
   */
  reject(oldNode, newNode) {
    // Ignore whitespace-only text nodes from parsed HTML.
    if (newNode.nodeType === Node.TEXT_NODE && newNode.nodeValue?.trim() === "") {
      return true;
    }

    // Shopify Section Rendering API injects this comment marker; skip it.
    if (newNode.nodeType === Node.COMMENT_NODE && newNode.nodeValue === "shopify:rendered_by_section_api") {
      return true;
    }

    return false;
  },
};

/**
 * Entry point: morph `oldTree` to look like `newTree`, returning the (usually same) root.
 *
 * @param {Node} oldTree Live DOM node already attached (or about to stay) in the document.
 * @param {Node | string} newTree Target structure: a Node, or HTML string parsed via DOMParser.
 * @param {MorphOptions} [options]
 * @returns {Node} The root of the updated tree (same reference as oldTree when childrenOnly).
 */
export function morph(oldTree, newTree, userOptions = {}) {
  const options = { ...MORPH_OPTIONS, ...userOptions };
  if (!oldTree || !newTree) {
    throw new Error("Both oldTree and newTree must be provided");
  }

  // Allow callers to pass raw HTML from fetch/Section API instead of building nodes manually.
  if (typeof newTree === "string") {
    const parsedNewTree = new DOMParser().parseFromString(newTree, "text/html").body.firstChild;
    if (!parsedNewTree) {
      throw new Error("newTree string is not valid HTML");
    }
    newTree = parsedNewTree;
  }

  // Fast path for section updates: patch child list only, keep the section root element.
  if (options.childrenOnly) {
    updateChildren(newTree, oldTree, options);
    return oldTree;
  }

  // Full-tree morph requires a single element root (not a DocumentFragment).
  if (newTree.nodeType === 11) {
    throw new Error("newTree should have one root node (not a DocumentFragment)");
  }

  return walk(newTree, oldTree, options);
}

/**
 * Recursively morph one old node to match one new node.
 *
 * Returns the node that should remain in the parent (usually `oldNode` after in-place
 * updates; sometimes `newNode` when types/tags/keys force a replacement).
 *
 * @param {Node} newNode Desired structure (often detached, from parsed HTML).
 * @param {Node} oldNode Live node to update in place when possible.
 * @param {MorphOptions} options
 * @returns {Node}
 */
function walk(newNode, oldNode, options) {
  if (!oldNode) return newNode;
  if (!newNode) return oldNode;

  // Same reference — nothing to do (e.g. already matched).
  if (newNode.isSameNode?.(oldNode)) return oldNode;

  // Different node kinds (element vs text, etc.) — replace with new subtree.
  if (newNode.nodeType !== oldNode.nodeType) return newNode;

  if (newNode instanceof Element && oldNode instanceof Element) {
    // Never replace Shopify’s accelerated checkout cart custom element (keeps checkout state).
    if (oldNode.tagName === "SHOPIFY-ACCELERATED-CHECKOUT-CART") return oldNode;

    // Different tags cannot be morphed in place — swap entire subtree.
    if (newNode.tagName !== oldNode.tagName) return newNode;

    // Both have keys and they differ — treat as different logical components (replace).
    const newKey = getNodeKey(newNode, options);
    const oldKey = getNodeKey(oldNode, options);
    if (newKey && oldKey && newKey !== oldKey) return newNode;
  }

  // Opt-out: only reconcile children, not attributes on this element (e.g. preserved widgets).
  if (
    oldNode instanceof Element &&
    oldNode.hasAttribute("data-skip-node-update") &&
    newNode instanceof Element &&
    newNode.hasAttribute("data-skip-node-update")
  ) {
    updateChildren(newNode, oldNode, options);
  } else {
    updateNode(newNode, oldNode, options);
    updateChildren(newNode, oldNode, options);
  }

  options.onAfterUpdate?.(newNode);
  return oldNode;
}

/**
 * Patch a single node’s attributes and scalar state (not its children).
 *
 * @param {Node} newNode
 * @param {Node} oldNode
 * @param {MorphOptions} options
 */
function updateNode(newNode, oldNode, options) {
  options.onBeforeUpdate?.(oldNode, newNode);

  // Preserve open/closed UI state unless the new markup uses declarative-open.
  if (
    (newNode instanceof HTMLDetailsElement && oldNode instanceof HTMLDetailsElement) ||
    (newNode instanceof HTMLDialogElement && oldNode instanceof HTMLDialogElement)
  ) {
    if (!newNode.hasAttribute("declarative-open")) {
      newNode.open = oldNode.open;
    }
  }

  if (newNode instanceof Element && oldNode instanceof Element) {
    // Skip attribute copy if trees are already equivalent (micro-optimization).
    if (!oldNode.isEqualNode(newNode)) {
      copyAttributes(newNode, oldNode);
    }
  } else if (newNode instanceof Text || newNode instanceof Comment) {
    if (oldNode.nodeValue !== newNode.nodeValue) {
      oldNode.nodeValue = newNode.nodeValue;
    }
  }

  // Form controls need property-level updates, not just attributes, to avoid losing user input.
  if (newNode instanceof HTMLInputElement && oldNode instanceof HTMLInputElement) {
    updateInput(newNode, oldNode);
  } else if (newNode instanceof HTMLOptionElement && oldNode instanceof HTMLOptionElement) {
    updateAttribute(newNode, oldNode, "selected");
  } else if (newNode instanceof HTMLTextAreaElement && oldNode instanceof HTMLTextAreaElement) {
    updateTextarea(newNode, oldNode);
  }
}

/**
 * Identity key for sibling matching and reorder detection.
 * Default: element `id` when present; otherwise nodes match by position/type only.
 *
 * @param {Node | undefined} node
 * @param {MorphOptions} [options]
 */
function getNodeKey(node, options) {
  return options?.getNodeKey?.(node) ?? (node instanceof Element ? node.id : undefined);
}

/**
 * Sync a boolean/reflecting attribute (checked, selected, disabled) from new → old,
 * including presence/absence of the attribute in the DOM.
 *
 * @param {HTMLInputElement | HTMLOptionElement} newNode
 * @param {HTMLInputElement | HTMLOptionElement} oldNode
 * @param {string} name
 */
function updateAttribute(newNode, oldNode, name) {
  if (newNode[name] !== oldNode[name]) {
    oldNode[name] = newNode[name];
    if (newNode[name] != null) {
      oldNode.setAttribute(name, "");
    } else {
      oldNode.removeAttribute(name);
    }
  }
}

/**
 * Copy attributes from `newNode` onto `oldNode` and remove stale ones.
 *
 * URL-like attributes (src, href, srcset, poster) are only updated when values
 * actually change — avoids unnecessary reloads/flicker when morph re-runs.
 *
 * @param {Element} newNode
 * @param {Element} oldNode
 */
function copyAttributes(newNode, oldNode) {
  const oldAttrs = oldNode.attributes;
  const newAttrs = newNode.attributes;

  // Add or update attributes present on the new element.
  for (const attr of Array.from(newAttrs)) {
    const { name: attrName, namespaceURI: attrNamespaceURI, value: attrValue } = attr;
    const localName = attr.localName || attrName;

    if (attrName === "src" || attrName === "href" || attrName === "srcset" || attrName === "poster") {
      if (oldNode.getAttribute(attrName) === attrValue) continue;
    }

    if (attrNamespaceURI) {
      const fromValue = oldNode.getAttributeNS(attrNamespaceURI, localName);
      if (fromValue !== attrValue) {
        oldNode.setAttributeNS(attrNamespaceURI, localName, attrValue);
      }
    } else if (!oldNode.hasAttribute(attrName)) {
      oldNode.setAttribute(attrName, attrValue);
    } else {
      const fromValue = oldNode.getAttribute(attrName);
      if (fromValue !== attrValue) {
        if (attrValue === "null" || attrValue === "undefined") {
          oldNode.removeAttribute(attrName);
        } else {
          oldNode.setAttribute(attrName, attrValue);
        }
      }
    }
  }

  // Remove attributes that existed on old but not on new.
  for (const attr of Array.from(oldAttrs)) {
    if (attr.specified === false) continue;

    const { name: attrName, namespaceURI: attrNamespaceURI } = attr;
    const localName = attr.localName || attrName;

    if (attrNamespaceURI) {
      if (!newNode.hasAttributeNS(attrNamespaceURI, localName)) {
        oldNode.removeAttributeNS(attrNamespaceURI, localName);
      }
    } else if (!newNode.hasAttribute(attrName)) {
      oldNode.removeAttribute(attrName);
    }
  }
}

/**
 * Merge input state: checked/disabled/indeterminate and value, with file inputs untouched.
 *
 * Preserves user typing where possible; handles range inputs and absent value attributes.
 *
 * @param {HTMLInputElement} newNode
 * @param {HTMLInputElement} oldNode
 */
function updateInput(newNode, oldNode) {
  const newValue = newNode.value;

  updateAttribute(newNode, oldNode, "checked");
  updateAttribute(newNode, oldNode, "disabled");

  if (newNode.indeterminate !== oldNode.indeterminate) {
    oldNode.indeterminate = newNode.indeterminate;
  }

  // File inputs cannot have their value set programmatically for security reasons.
  if (oldNode.type === "file") return;

  if (newValue !== oldNode.value) {
    oldNode.setAttribute("value", newValue);
    oldNode.value = newValue;
  }

  if (newValue === "null") {
    oldNode.value = "";
    oldNode.removeAttribute("value");
  }

  if (!newNode.hasAttributeNS(null, "value")) {
    oldNode.removeAttribute("value");
  } else if (oldNode.type === "range") {
    oldNode.value = newValue;
  }
}

/**
 * Sync textarea `.value` and optional first text child (legacy content model).
 *
 * Skips overwriting the text child when it only mirrors the placeholder (empty value).
 *
 * @param {HTMLTextAreaElement} newNode
 * @param {HTMLTextAreaElement} oldNode
 */
function updateTextarea(newNode, oldNode) {
  const newValue = newNode.value;
  if (newValue !== oldNode.value) {
    oldNode.value = newValue;
  }

  const firstChild = oldNode.firstChild;
  if (firstChild?.nodeType === Node.TEXT_NODE) {
    if (newValue === "" && firstChild.nodeValue === oldNode.placeholder) {
      return;
    }
    firstChild.nodeValue = newValue;
  }
}

/**
 * Synchronize child lists between `oldNode` and `newNode` (the core diff algorithm).
 *
 * Walks both child lists in parallel with an `offset` to account for insertions that
 * shift indices on the new side. For each position:
 *   1. Extra old children → remove
 *   2. Extra new children → append
 *   3. `same()` match → walk() in place (or replace if walk returns a different node)
 *   4. `reject()` → drop from new tree and retry same index
 *   5. Look ahead in old siblings for a key/tag match → insertBefore (reorder)
 *   6. No keys on either side → morph in place anyway
 *   7. Otherwise → insert new node before old (add)
 *
 * `data-skip-subtree-update` on both sides skips entire child reconciliation.
 *
 * @param {Node} newNode
 * @param {Node} oldNode
 * @param {MorphOptions} options
 */
function updateChildren(newNode, oldNode, options) {
  if (
    oldNode instanceof Element &&
    oldNode.hasAttribute("data-skip-subtree-update") &&
    newNode instanceof Element &&
    newNode.hasAttribute("data-skip-subtree-update")
  ) {
    return;
  }

  let oldChild;
  let newChild;
  let morphed;
  let oldMatch;
  // When we insert nodes from newTree into oldTree, newTree’s child indices shift;
  // offset aligns the parallel scan (newChild index = i - offset).
  let offset = 0;

  for (let i = 0; ; i++) {
    oldChild = oldNode.childNodes[i];
    newChild = newNode.childNodes[i - offset];

    if (!oldChild && !newChild) {
      break;
    }

    // Trailing old nodes with no new counterpart — remove from live DOM.
    if (!newChild) {
      if (oldChild) oldNode.removeChild(oldChild);
      i--;
      continue;
    }

    // Trailing new nodes — append to live DOM (may move nodes from detached new tree).
    if (!oldChild) {
      oldNode.appendChild(newChild);
      offset++;
      continue;
    }

    // Direct pairwise match (tag, key, or trimmed text) — recurse.
    if (same(newChild, oldChild, options)) {
      morphed = walk(newChild, oldChild, options);
      if (morphed !== oldChild) {
        oldNode.replaceChild(morphed, oldChild);
        offset++;
      }
      continue;
    }

    // Server sent a node we don’t want — remove from new and try same index again.
    if (options.reject?.(oldChild, newChild)) {
      newNode.removeChild(newChild);
      i--;
      continue;
    }

    // Reorder: search remaining old siblings for something that matches this new child.
    oldMatch = null;
    for (let j = i; j < oldNode.childNodes.length; j++) {
      const potentialOldNode = oldNode.childNodes[j];
      if (potentialOldNode && same(potentialOldNode, newChild, options)) {
        oldMatch = potentialOldNode;
        break;
      }
    }

    if (oldMatch) {
      morphed = walk(newChild, oldMatch, options);
      if (morphed !== oldMatch) offset++;
      oldNode.insertBefore(morphed, oldChild);
    } else if (!getNodeKey(newChild, options) && !getNodeKey(oldChild, options)) {
      // Anonymous siblings (no id/key): still try in-place morph before inserting.
      morphed = walk(newChild, oldChild, options);
      if (morphed !== oldChild) {
        oldNode.replaceChild(morphed, oldChild);
        offset++;
      }
    } else {
      // Keys differ or only one has a key — insert new node, keep scanning old at i.
      oldNode.insertBefore(newChild, oldChild);
      offset++;
    }
  }
}

/**
 * Whether two child nodes are considered the “same” slot for parallel sync.
 *
 * Elements: same tag; if both have getNodeKey values, keys must match.
 * Text: compared after trim (ignores insignificant whitespace differences).
 * Comments: exact nodeValue match.
 *
 * @param {Node} a
 * @param {Node} b
 * @param {MorphOptions} options
 */
function same(a, b, options) {
  if (a.nodeType !== b.nodeType) return false;

  if (a.nodeType === Node.ELEMENT_NODE) {
    if (a instanceof Element && b instanceof Element && a.tagName !== b.tagName) return false;

    const aKey = getNodeKey(a, options);
    const bKey = getNodeKey(b, options);
    if (aKey && bKey && aKey !== bKey) return false;
  }

  if (a.nodeType === Node.TEXT_NODE && b.nodeType === Node.TEXT_NODE) {
    return a.nodeValue?.trim() === b.nodeValue?.trim();
  }

  if (a.nodeType === Node.COMMENT_NODE && b.nodeType === Node.COMMENT_NODE) {
    return a.nodeValue === b.nodeValue;
  }

  return true;
}
