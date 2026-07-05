const { Router } = require('express');
const { body } = require('express-validator');
const multer = require('multer');
const { requireCustomer } = require('../../middlewares/role.middleware');
const controller = require('./campaign.controller');

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter(req, file, cb) {
    if (file.fieldname === 'image') {
      const imgAllowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
      if (imgAllowed.includes(file.mimetype)) return cb(null, true);
      return cb(new Error('Görsel için sadece JPG, PNG, WEBP veya GIF yüklenebilir'));
    }
    const allowed = ['text/csv', 'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
    if (allowed.includes(file.mimetype) || file.originalname.match(/\.(csv|xlsx|xls)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Sadece CSV veya Excel dosyası yüklenebilir'));
    }
  },
});

router.use(requireCustomer);

router.post(
  '/',
  upload.fields([{ name: 'file', maxCount: 1 }, { name: 'image', maxCount: 1 }]),
  [
    body('title').trim().notEmpty().withMessage('Kampanya başlığı gerekli'),
    body('messageTemplate').trim().notEmpty().withMessage('Mesaj şablonu gerekli'),
  ],
  controller.createCampaign
);

router.get('/active', controller.getActiveCampaign);
router.get('/:id/progress', controller.getCampaignProgress);
router.get('/', controller.listCampaigns);
router.get('/:id', controller.getCampaign);

module.exports = router;
