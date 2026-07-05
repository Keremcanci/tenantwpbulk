const { Router } = require('express');
const { requireCustomer } = require('../../middlewares/role.middleware');
const prisma = require('../../config/database');

const router = Router();
router.use(requireCustomer);

router.get('/profile', async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { id: true, email: true, fullName: true, credit: true, isActive: true },
    });
    if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    res.json(user);
  } catch (err) { next(err); }
});

module.exports = router;
