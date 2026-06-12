const jwt = require('jsonwebtoken');

const ADMIN_ROLES = new Set(['admin', 'superAdmin']);

function getBearerToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7);
  return req.cookies?.token || req.cookies?.authToken || req.cookies?.jwt || null;
}

function createAdminMiddleware({ User, jwtSecret }) {
  if (!User) throw new Error('createAdminMiddleware requires a User model');

  return async function requireAdmin(req, res, next) {
    try {
      let user = req.user || null;
      const token = getBearerToken(req);

      if (!user && token) {
        const payload = jwt.verify(token, jwtSecret || process.env.JWT_SECRET || process.env.SESSION_SECRET);
        const userId = payload.id || payload._id || payload.userId;
        if (userId) user = await User.findById(userId).select('-password -passwordHash');
      }

      if (!user || !ADMIN_ROLES.has(user.role)) {
        return res.status(403).json({ success: false, message: 'دسترسی غیرمجاز است.' });
      }

      if (user.isBlocked || user.blocked) {
        return res.status(403).json({ success: false, message: 'حساب کاربری مسدود شده است.' });
      }

      req.adminUser = user;
      next();
    } catch (error) {
      return res.status(401).json({ success: false, message: 'لطفا دوباره وارد شوید.' });
    }
  };
}

module.exports = {
  ADMIN_ROLES,
  createAdminMiddleware,
};
