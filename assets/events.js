/**
 * @typedef {Object} VariantResource
 * @property {string} [id]
 * @property {boolean} [available]
 * @property {Object} [featured_media]
 */

/**
 * @typedef {Object} VariantUpdateData
 * @property {Document} html
 * @property {string} [productId]
 * @property {string} [sectionId]
 * @property {Object} [newProduct]
 * @property {string} [newProduct.id]
 * @property {string} [newProduct.url]
 */

export const ThemeEvents = {
  variantSelected: "variant:selected",
  variantUpdate: "variant:update",
};

export class VariantUpdateEvent extends Event {
  /**
   * @param {VariantResource | null} resource
   * @param {string} sourceId
   * @param {VariantUpdateData} data
   */
  constructor(resource, sourceId, data) {
    super(ThemeEvents.variantUpdate, { bubbles: true });
    this.detail = {
      resource: resource || null,
      sourceId,
      data,
    };
  }
}
