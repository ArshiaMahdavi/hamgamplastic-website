const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { body, param, query, validationResult } = require('express-validator');
const { createAdminMiddleware } = require('./admin.middleware');
const defaultModels = require('./admin.models');
const DefaultProduct = require('./product.model');

const ORDER_STATUSES = ['pending', 'processing', 'paid', 'shipped', 'delivered', 'cancelled'];
const ROLES = ['user', 'admin', 'superAdmin'];

function cleanText(value) {
  return typeof value === 'string' ? value.trim().replace(/[<>]/g, '') : value;
}

function cleanProductPayload(body, file) {
  const payload = {};
  const allowed = ['name', 'title', 'price', 'category', 'description', 'rating', 'stock', 'isAvailable', 'isActive', 'isFeatured'];

  for (const key of allowed) {
    if (body[key] === undefined || body[key] === '') continue;
    payload[key] = cleanText(body[key]);
  }

  if (payload.price !== undefined) payload.price = Number(payload.price);
  if (payload.rating !== undefined) payload.rating = Number(payload.rating);
  if (payload.stock !== undefined) payload.stock = Number(payload.stock);
  for (const key of ['isAvailable', 'isActive', 'isFeatured']) {
    if (payload[key] !== undefined) payload[key] = payload[key] === true || payload[key] === 'true' || payload[key] === 'on';
  }
  if (!payload.name && payload.title) payload.name = payload.title;
  if (!payload.title && payload.name) payload.title = payload.name;
  if (file) payload.image = `/uploads/products/${file.filename}`;
  return payload;
}

function assertValid(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({ success: false, message: 'اطلاعات ارسال شده معتبر نیست.', errors: errors.array() });
  }
  next();
}

function safeRegex(text) {
  return new RegExp(String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
}

function createAdminRouter(options = {}) {
  const router = express.Router();
  const User = options.User;
  const Product = options.Product || DefaultProduct;
  const Order = options.Order;
  const Discount = options.Discount || defaultModels.Discount;
  const Setting = options.Setting || defaultModels.Setting;
  const requireAdmin = createAdminMiddleware({ User, jwtSecret: options.jwtSecret });

  if (!User || !Order) {
    throw new Error('createAdminRouter requires User and Order models from the host app');
  }

  const uploadDir = options.uploadDir || path.join(process.cwd(), 'public', 'uploads', 'admin');
  const productUploadDir = options.productUploadDir || path.join(process.cwd(), 'public', 'uploads', 'products');
  fs.mkdirSync(uploadDir, { recursive: true });
  fs.mkdirSync(productUploadDir, { recursive: true });

  const storage = multer.diskStorage({
    destination: uploadDir,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
    },
  });

  const upload = multer({
    storage,
    limits: { fileSize: 3 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      if (!/^image\/(png|jpe?g|webp|gif|svg\+xml)$/.test(file.mimetype)) {
        return cb(new Error('Only image uploads are allowed'));
      }
      cb(null, true);
    },
  });

  const productUpload = multer({
    storage: multer.diskStorage({
      destination: productUploadDir,
      filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `product-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
      },
    }),
    limits: { fileSize: 4 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      if (!/^image\/(png|jpe?g|webp|gif|svg\+xml)$/.test(file.mimetype)) {
        return cb(new Error('Only image uploads are allowed'));
      }
      cb(null, true);
    },
  });

  router.get('/me', requireAdmin, (req, res) => {
    res.json({ success: true, user: req.adminUser });
  });

  router.get('/stats', requireAdmin, async (req, res, next) => {
    try {
      const [totalProducts, totalOrders, totalUsers, pendingOrders, completedOrders, latestOrders, latestUsers] = await Promise.all([
        Product.countDocuments({}),
        Order.countDocuments({}),
        User.countDocuments({}),
        Order.countDocuments({ status: { $in: ['pending', 'processing'] } }),
        Order.countDocuments({ status: { $in: ['paid', 'shipped', 'delivered'] } }),
        Order.find({}).sort({ createdAt: -1 }).limit(8).lean(),
        User.find({}).sort({ createdAt: -1 }).limit(8).select('-password -passwordHash').lean(),
      ]);

      const revenueResult = await Order.aggregate([
        { $match: { status: { $in: ['paid', 'shipped', 'delivered'] } } },
        { $group: { _id: null, total: { $sum: { $ifNull: ['$totalPrice', '$total'] } } } },
      ]);

      const monthlySales = await Order.aggregate([
        { $match: { status: { $in: ['paid', 'shipped', 'delivered'] }, createdAt: { $exists: true } } },
        { $group: { _id: { y: { $year: '$createdAt' }, m: { $month: '$createdAt' } }, total: { $sum: { $ifNull: ['$totalPrice', '$total'] } }, count: { $sum: 1 } } },
        { $sort: { '_id.y': 1, '_id.m': 1 } },
        { $limit: 12 },
      ]);

      const bestSellingProducts = await Order.aggregate([
        { $unwind: { path: '$items', preserveNullAndEmptyArrays: false } },
        { $group: { _id: '$items.product', quantity: { $sum: { $ifNull: ['$items.quantity', 1] } }, title: { $first: '$items.title' } } },
        { $sort: { quantity: -1 } },
        { $limit: 6 },
      ]);

      res.json({
        success: true,
        stats: {
          totalProducts,
          totalOrders,
          totalUsers,
          totalRevenue: revenueResult[0]?.total || 0,
          pendingOrders,
          completedOrders,
          latestOrders,
          latestUsers,
          bestSellingProducts,
          monthlySales,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/products', requireAdmin, query('search').optional().trim(), async (req, res, next) => {
    try {
      const filter = {};
      if (req.query.search) filter.$or = [{ title: safeRegex(req.query.search) }, { name: safeRegex(req.query.search) }];
      if (req.query.category) filter.category = cleanText(req.query.category);
      const productsQuery = Product.find(filter).sort({ createdAt: -1 });
      if (req.query.limit) productsQuery.limit(Math.min(Number(req.query.limit), 1000));
      const products = await productsQuery.lean();
      res.json({ success: true, products });
    } catch (error) {
      next(error);
    }
  });

  router.post(
    '/products',
    requireAdmin,
    productUpload.single('imageFile'),
    body('title').optional().trim().isLength({ min: 1, max: 180 }),
    body('name').optional().trim().isLength({ min: 1, max: 180 }),
    body('price').isFloat({ min: 0 }),
    body('stock').optional().isInt({ min: 0 }),
    body('rating').optional().isFloat({ min: 0, max: 5 }),
    assertValid,
    async (req, res, next) => {
      try {
        const payload = cleanProductPayload(req.body, req.file);
        const product = await Product.create(payload);
        res.status(201).json({ success: true, product });
      } catch (error) {
        next(error);
      }
    }
  );

  router.put('/products/:id', requireAdmin, productUpload.single('imageFile'), param('id').isMongoId(), assertValid, async (req, res, next) => {
    try {
      const payload = cleanProductPayload(req.body, req.file);
      const product = await Product.findByIdAndUpdate(req.params.id, payload, { new: true, runValidators: true });
      if (!product) return res.status(404).json({ success: false, message: 'محصول پیدا نشد.' });
      res.json({ success: true, product });
    } catch (error) {
      next(error);
    }
  });

  router.delete('/products/:id', requireAdmin, param('id').isMongoId(), assertValid, async (req, res, next) => {
    try {
      const product = await Product.findByIdAndDelete(req.params.id);
      if (!product) return res.status(404).json({ success: false, message: 'محصول پیدا نشد.' });
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  router.get('/orders', requireAdmin, async (req, res, next) => {
    try {
      const filter = {};
      if (req.query.status) filter.status = cleanText(req.query.status);
      const orders = await Order.find(filter).sort({ createdAt: -1 }).limit(200).lean();
      res.json({ success: true, orders });
    } catch (error) {
      next(error);
    }
  });

  router.put(
    '/orders/:id/status',
    requireAdmin,
    param('id').isMongoId(),
    body('status').isIn(ORDER_STATUSES),
    assertValid,
    async (req, res, next) => {
      try {
        const order = await Order.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true, runValidators: true });
        if (!order) return res.status(404).json({ success: false, message: 'سفارش پیدا نشد.' });
        res.json({ success: true, order });
      } catch (error) {
        next(error);
      }
    }
  );

  router.get('/users', requireAdmin, async (req, res, next) => {
    try {
      const filter = req.query.search
        ? { $or: [{ name: safeRegex(req.query.search) }, { email: safeRegex(req.query.search) }, { phone: safeRegex(req.query.search) }] }
        : {};
      const users = await User.find(filter).sort({ createdAt: -1 }).limit(200).select('-password -passwordHash').lean();
      res.json({ success: true, users });
    } catch (error) {
      next(error);
    }
  });

  router.put('/users/:id/role', requireAdmin, param('id').isMongoId(), body('role').isIn(ROLES), assertValid, async (req, res, next) => {
    try {
      if (String(req.adminUser._id) === req.params.id && req.body.role === 'user') {
        return res.status(400).json({ success: false, message: 'نمی‌توانید نقش مدیریت خودتان را حذف کنید.' });
      }
      const user = await User.findByIdAndUpdate(req.params.id, { role: req.body.role }, { new: true, runValidators: true }).select('-password -passwordHash');
      if (!user) return res.status(404).json({ success: false, message: 'کاربر پیدا نشد.' });
      res.json({ success: true, user });
    } catch (error) {
      next(error);
    }
  });

  router.put('/users/:id/block', requireAdmin, param('id').isMongoId(), body('blocked').isBoolean(), assertValid, async (req, res, next) => {
    try {
      if (String(req.adminUser._id) === req.params.id) {
        return res.status(400).json({ success: false, message: 'نمی‌توانید حساب خودتان را مسدود کنید.' });
      }
      const user = await User.findByIdAndUpdate(req.params.id, { isBlocked: req.body.blocked }, { new: true, runValidators: true }).select('-password -passwordHash');
      if (!user) return res.status(404).json({ success: false, message: 'کاربر پیدا نشد.' });
      res.json({ success: true, user });
    } catch (error) {
      next(error);
    }
  });

  router.get('/discounts', requireAdmin, async (req, res, next) => {
    try {
      const discounts = await Discount.find({}).sort({ createdAt: -1 }).lean();
      res.json({ success: true, discounts });
    } catch (error) {
      next(error);
    }
  });

  router.post('/discounts', requireAdmin, body('code').trim().isLength({ min: 2, max: 50 }), body('type').isIn(['percentage', 'fixed']), body('value').isFloat({ min: 0 }), assertValid, async (req, res, next) => {
    try {
      const discount = await Discount.create(req.body);
      res.status(201).json({ success: true, discount });
    } catch (error) {
      next(error);
    }
  });

  router.put('/discounts/:id', requireAdmin, param('id').isMongoId(), assertValid, async (req, res, next) => {
    try {
      const discount = await Discount.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
      if (!discount) return res.status(404).json({ success: false, message: 'تخفیف پیدا نشد.' });
      res.json({ success: true, discount });
    } catch (error) {
      next(error);
    }
  });

  router.delete('/discounts/:id', requireAdmin, param('id').isMongoId(), assertValid, async (req, res, next) => {
    try {
      const discount = await Discount.findByIdAndDelete(req.params.id);
      if (!discount) return res.status(404).json({ success: false, message: 'تخفیف پیدا نشد.' });
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  router.get('/settings', requireAdmin, async (req, res, next) => {
    try {
      const settings = await Setting.findOneAndUpdate({ key: 'site' }, { $setOnInsert: { key: 'site' } }, { new: true, upsert: true }).lean();
      res.json({ success: true, settings });
    } catch (error) {
      next(error);
    }
  });

  router.put('/settings', requireAdmin, async (req, res, next) => {
    try {
      const settings = await Setting.findOneAndUpdate({ key: 'site' }, req.body, { new: true, upsert: true, runValidators: true });
      res.json({ success: true, settings });
    } catch (error) {
      next(error);
    }
  });

  router.post('/media', requireAdmin, upload.single('image'), (req, res) => {
    res.status(201).json({ success: true, path: `/uploads/admin/${req.file.filename}` });
  });

  router.use((error, req, res, next) => {
    const production = process.env.NODE_ENV === 'production';
    res.status(error.status || 500).json({
      success: false,
      message: production ? 'خطای سرور رخ داد.' : error.message,
    });
  });

  return router;
}

module.exports = {
  createAdminRouter,
};
