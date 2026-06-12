const mongoose = require('mongoose');

const ProductSchema = new mongoose.Schema(
  {
    legacyId: { type: String, trim: true, index: true, sparse: true },
    name: { type: String, required: true, trim: true, maxlength: 180 },
    title: { type: String, trim: true, maxlength: 180 },
    price: { type: Number, required: true, min: 0 },
    category: { type: String, trim: true, default: 'عمومی', index: true },
    image: { type: String, trim: true, default: '' },
    description: { type: String, trim: true, default: '' },
    rating: { type: Number, min: 0, max: 5, default: 0 },
    stock: { type: Number, min: 0, default: 0 },
    isAvailable: { type: Boolean, default: true },
    isActive: { type: Boolean, default: true },
    isFeatured: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

ProductSchema.index({ name: 'text', title: 'text', category: 'text', description: 'text' });
ProductSchema.index({ legacyId: 1, name: 1 }, { unique: true, sparse: true });

ProductSchema.pre('validate', function setProductDefaults(next) {
  if (!this.title && this.name) this.title = this.name;
  if (!this.name && this.title) this.name = this.title;
  this.isAvailable = this.stock > 0 && this.isActive !== false;
  next();
});

module.exports = mongoose.models.Product || mongoose.model('Product', ProductSchema);
