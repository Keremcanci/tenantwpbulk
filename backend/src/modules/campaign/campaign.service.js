const Papa = require('papaparse');
const XLSX = require('xlsx');
const prisma = require('../../config/database');
const { campaignDispatchQueue } = require('../queue/queue');

// --- Alıcı parse yardımcıları ---

function normalizePhone(raw) {
  return String(raw || '').replace(/\D/g, '');
}

function isValidPhone(phone) {
  return phone.length >= 10 && phone.length <= 15;
}

function parseManual(text) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [rawPhone, rawName] = line.split(',');
      return { phoneNumber: normalizePhone(rawPhone), name: rawName?.trim() || null };
    })
    .filter((r) => isValidPhone(r.phoneNumber));
}

function fromRows(rows) {
  return rows
    .map((row) => {
      const phone = normalizePhone(
        row.phone || row.Phone || row.telefon || row.Telefon ||
        row.number || row.Number || row.numara || row.Numara || ''
      );
      const name =
        row.name || row.Name || row.isim || row['İsim'] ||
        row.ad || row.Ad || null;
      return { phoneNumber: phone, name: name ? String(name).trim() : null };
    })
    .filter((r) => isValidPhone(r.phoneNumber));
}

function parseCSVBuffer(buffer) {
  const { data } = Papa.parse(buffer.toString('utf8'), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });
  return fromRows(data);
}

function parseExcelBuffer(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
  return fromRows(rows);
}

function parseRecipients(file, manualList) {
  if (file) {
    const mime = file.mimetype || '';
    if (mime.includes('csv') || file.originalname?.endsWith('.csv')) {
      return parseCSVBuffer(file.buffer);
    }
    return parseExcelBuffer(file.buffer);
  }
  if (manualList) return parseManual(manualList);
  throw Object.assign(new Error('Alıcı listesi gerekli (dosya veya manuel)'), { status: 400 });
}

// --- Kampanya oluştur ---

async function createCampaign(userId, { title, messageTemplate, manualList }, file, imageFile) {
  // 1. Aktif kampanya kontrolü
  const activeCampaign = await prisma.campaign.findFirst({
    where: { userId, status: { in: ['pending', 'running'] } },
  });
  if (activeCampaign) {
    throw Object.assign(new Error('Zaten aktif bir kampanyanız var'), { status: 409 });
  }

  // 2. Alıcıları parse et
  const recipients = parseRecipients(file, manualList);
  if (recipients.length === 0) {
    throw Object.assign(new Error('Geçerli alıcı bulunamadı'), { status: 400 });
  }

  // Tekrarlayan numaraları temizle
  const unique = [...new Map(recipients.map((r) => [r.phoneNumber, r])).values()];
  const totalCount = unique.length;

  // 3. Kredi kontrolü
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (user.credit < totalCount) {
    throw Object.assign(
      new Error(`Yetersiz kredi. Gerekli: ${totalCount}, Mevcut: ${user.credit}`),
      { status: 402 }
    );
  }

  // 4–9. Transaction: kredi düş, kampanya oluştur, alıcıları ekle
  const campaign = await prisma.$transaction(async (tx) => {
    // Krediyi düş
    await tx.user.update({
      where: { id: userId },
      data: { credit: { decrement: totalCount } },
    });

    await tx.creditTransaction.create({
      data: {
        userId,
        type: 'deduct',
        amount: totalCount,
        description: `Kampanya başlatıldı: "${title}" — ${totalCount} alıcı`,
      },
    });

    // Kampanya kaydı
    const imageData = imageFile ? imageFile.buffer.toString('base64') : null;
    const camp = await tx.campaign.create({
      data: {
        userId,
        title,
        messageTemplate,
        imageData,
        status: 'pending',
        totalCount,
        creditUsed: totalCount,
      },
    });

    // Alıcıları toplu ekle
    await tx.campaignRecipient.createMany({
      data: unique.map((r) => ({
        campaignId: camp.id,
        phoneNumber: r.phoneNumber,
        name: r.name,
      })),
    });

    return camp;
  });

  // BullMQ'ya dispatch job'u ekle
  await campaignDispatchQueue.add('dispatch', { campaignId: campaign.id }, { attempts: 2 });

  return {
    id: campaign.id,
    title: campaign.title,
    status: campaign.status,
    totalCount,
    creditUsed: totalCount,
    createdAt: campaign.createdAt,
  };
}

// --- Sorgular ---

async function getActiveCampaign(userId) {
  return prisma.campaign.findFirst({
    where: { userId, status: { in: ['pending', 'running'] } },
    select: {
      id: true, title: true, status: true,
      totalCount: true, successCount: true, failedCount: true,
      creditUsed: true,
      startedAt: true, createdAt: true,
      whatsappAccount: { select: { phoneNumber: true, displayName: true } },
    },
  });
}

async function getCampaignProgress(campaignId, userId) {
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, userId },
    select: {
      id: true, title: true, status: true,
      totalCount: true, successCount: true, failedCount: true,
      creditUsed: true,
      startedAt: true, completedAt: true,
    },
  });
  if (!campaign) throw Object.assign(new Error('Kampanya bulunamadı'), { status: 404 });
  return campaign;
}

async function listCampaigns(userId, { page = 1, limit = 20 } = {}) {
  const skip = (page - 1) * limit;
  const [campaigns, total] = await Promise.all([
    prisma.campaign.findMany({
      where: { userId },
      select: {
        id: true, title: true, status: true,
        totalCount: true, successCount: true, failedCount: true,
        creditUsed: true,
        startedAt: true, completedAt: true, createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.campaign.count({ where: { userId } }),
  ]);
  return { campaigns, total, page, limit, pages: Math.ceil(total / limit) };
}

async function getCampaign(campaignId, userId) {
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, userId },
    include: {
      whatsappAccount: { select: { phoneNumber: true, displayName: true } },
      _count: { select: { recipients: true } },
    },
  });
  if (!campaign) throw Object.assign(new Error('Kampanya bulunamadı'), { status: 404 });
  return campaign;
}

module.exports = {
  createCampaign,
  getActiveCampaign,
  getCampaignProgress,
  listCampaigns,
  getCampaign,
};
