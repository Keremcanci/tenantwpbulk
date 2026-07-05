import api from './axios'

// Auth
export const login = (email, password) =>
  api.post('/auth/login', { email, password }).then((r) => r.data)

export const logout = (refreshToken) =>
  api.post('/auth/logout', { refreshToken })

// Dashboard
export const getDashboard = () => api.get('/admin/dashboard').then((r) => r.data)
export const getActiveCampaigns = () => api.get('/admin/campaigns').then((r) => r.data)
export const stopCampaign = (id) => api.post(`/admin/campaigns/${id}/stop`).then((r) => r.data)
export const getQueueStats = () => api.get('/admin/queue/stats').then((r) => r.data)
export const clearQueues = () => api.post('/admin/queue/clear').then((r) => r.data)

// Customers
export const getCustomers = (page = 1) =>
  api.get('/admin/customers', { params: { page } }).then((r) => r.data)
export const getCustomer = (id) =>
  api.get(`/admin/customers/${id}`).then((r) => r.data)
export const createCustomer = (email, fullName) =>
  api.post('/admin/customers', { email, fullName }).then((r) => r.data)
export const loadCredit = (id, amount, description) =>
  api.post(`/admin/customers/${id}/credit`, { amount, description }).then((r) => r.data)
export const getCreditHistory = (id, page = 1) =>
  api.get(`/admin/customers/${id}/credit-history`, { params: { page } }).then((r) => r.data)

// WhatsApp accounts
export const getWAAccounts = () =>
  api.get('/admin/whatsapp/accounts').then((r) => r.data)
export const addWAAccount = (data) =>
  api.post('/admin/whatsapp/accounts', data).then((r) => r.data)
export const connectWAAccount = (id) =>
  api.post(`/admin/whatsapp/accounts/${id}/connect`).then((r) => r.data)
export const disconnectWAAccount = (id) =>
  api.post(`/admin/whatsapp/accounts/${id}/disconnect`).then((r) => r.data)
export const updateWAAccountType = (id, type) =>
  api.patch(`/admin/whatsapp/accounts/${id}/type`, { type }).then((r) => r.data)
export const getWAHealth = (id) =>
  api.get(`/admin/whatsapp/accounts/${id}/health`).then((r) => r.data)
export const getWAAccount = (id) =>
  api.get(`/admin/whatsapp/accounts/${id}`).then((r) => r.data)
export const provisionWAAccount = (data = {}) =>
  api.post('/admin/whatsapp/accounts/provision', data).then((r) => r.data)

export const bulkProvisionWAAccounts = (data) =>
  api.post('/admin/whatsapp/accounts/bulk-provision', data).then((r) => r.data)
