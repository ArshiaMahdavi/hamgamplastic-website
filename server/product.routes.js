const express = require('express');
const mongoose = require('mongoose');
const Product = require('./product.model');

const router = express.Router();

function safeRegex(text) {
  return new RegExp(String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
}

function publicProductQuery(req) {
  const filter = { isActive: { $ne: false } };
  if (req.query.category) filter.category = req.query.category;
  if (req.query.search) {
    const search = safeRegex(req.query.search);
    filter.$or = [{ name: search }, { title: search }, { category: search }, { description: search }];
  }
  return filter;
}

router.get('/', async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 200, 500);
    const products = await Product.find(publicProductQuery(req)).sort({ createdAt: -1 }).limit(limit).lean({ virtuals: true });
    res.json({ success: true, products });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const value = req.params.id;
    const byId = mongoose.Types.ObjectId.isValid(value) ? { _id: value } : null;
    const product = await Product.findOne({
      isActive: { $ne: false },
      $or: [byId, { legacyId: value }, { name: value }, { title: value }].filter(Boolean),
    }).lean({ virtuals: true });

    if (!product) return res.status(404).json({ success: false, message: 'محصول پیدا نشد.' });
    res.json({ success: true, product });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
