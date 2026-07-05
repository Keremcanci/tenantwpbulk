function errorHandler(err, req, res, next) {
  const status = err.status || 500;
  const message = err.message || 'Sunucu hatası';

  if (status === 500) {
    console.error('[ERROR]', err);
  }

  res.status(status).json({ error: message });
}

module.exports = { errorHandler };
