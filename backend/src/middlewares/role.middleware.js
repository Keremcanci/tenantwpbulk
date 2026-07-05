const { requireAuth } = require('./auth.middleware');

function requireRole(role) {
  return [
    requireAuth,
    (req, res, next) => {
      if (req.user.role !== role) {
        return res.status(403).json({ error: 'Bu işlem için yetkiniz yok' });
      }
      next();
    },
  ];
}

const requireSuperAdmin = requireRole('superadmin');
const requireCustomer = requireRole('customer');

module.exports = { requireSuperAdmin, requireCustomer };
