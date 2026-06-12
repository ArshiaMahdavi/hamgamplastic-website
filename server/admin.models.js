const mongoose = require('mongoose');

function getOrCreateModel(name, schema) {
  return mongoose.models[name] || mongoose.model(name, schema);
}

const DiscountSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, trim: true, uppercase: true, unique: true },
    title: { type: String, trim: true, default: '' },
    type: { type: String, enum: ['percentage', 'fixed'], required: true },
    value: { type: Number, required: true, min: 0 },
    expiresAt: { type: Date },
    usageLimit: { type: Number, min: 0, default: 0 },
    usedCount: { type: Number, min: 0, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const SettingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: 'site' },
    companyName: { type: String, trim: true, default: 'همگام پلاستیک' },
    phone: { type: String, trim: true, default: '' },
    email: { type: String, trim: true, default: '' },
    address: { type: String, trim: true, default: '' },
    logoPath: { type: String, trim: true, default: '' },
    seoTitle: { type: String, trim: true, default: '' },
    seoDescription: { type: String, trim: true, default: '' },
    socialLinks: {
      instagram: { type: String, trim: true, default: '' },
      telegram: { type: String, trim: true, default: '' },
      whatsapp: { type: String, trim: true, default: '' },
      linkedin: { type: String, trim: true, default: '' },
    },
  },
  { timestamps: true }
);

module.exports = {
  Discount: getOrCreateModel('Discount', DiscountSchema),
  Setting: getOrCreateModel('Setting', SettingSchema),
};
