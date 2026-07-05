import api from './customerAxios'

export const getProfile = () => api.get('/customer/profile').then(r => r.data)

export const login = (email, password) =>
  api.post('/auth/login', { email, password }).then(r => r.data)

export const logout = (refreshToken) =>
  api.post('/auth/logout', { refreshToken }).then(r => r.data)

export const changePassword = (oldPassword, newPassword) =>
  api.post('/auth/change-password', { oldPassword, newPassword }).then(r => r.data)

export const createCampaign = (formData) =>
  api.post('/customer/campaigns', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data)

export const getActiveCampaign = () =>
  api.get('/customer/campaigns/active').then(r => r.data)

export const listCampaigns = (page = 1) =>
  api.get('/customer/campaigns', { params: { page } }).then(r => r.data)

export const getCampaign = (id) =>
  api.get(`/customer/campaigns/${id}`).then(r => r.data)
