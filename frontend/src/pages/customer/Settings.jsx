import { useState } from 'react'
import CustomerLayout from '../../components/CustomerLayout'
import { changePassword } from '../../api/customer'
import useCustomerStore from '../../store/customerStore'

export default function Settings() {
  const user = useCustomerStore((s) => s.user)
  const [form, setForm] = useState({ oldPassword: '', newPassword: '', confirmPassword: '' })
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  const inputCls = 'w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500'

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (form.newPassword !== form.confirmPassword) {
      setError('Yeni şifreler eşleşmiyor'); return
    }
    if (form.newPassword.length < 8) {
      setError('Yeni şifre en az 8 karakter olmalı'); return
    }

    setLoading(true)
    try {
      await changePassword(form.oldPassword, form.newPassword)
      setSuccess('Şifreniz başarıyla değiştirildi.')
      setForm({ oldPassword: '', newPassword: '', confirmPassword: '' })
    } catch (err) {
      setError(err.response?.data?.error || 'Hata oluştu')
    } finally {
      setLoading(false)
    }
  }

  return (
    <CustomerLayout>
      <h1 className="text-2xl font-bold text-white mb-6">Ayarlar</h1>

      <div className="max-w-lg">
        {/* Hesap bilgisi */}
        <div className="bg-gray-800 rounded-xl p-5 mb-6">
          <h2 className="font-semibold text-white mb-3">Hesap Bilgileri</h2>
          <div className="space-y-2 text-sm">
            <div className="flex gap-4">
              <span className="text-gray-400 w-24">Ad Soyad</span>
              <span className="text-white">{user?.fullName || '—'}</span>
            </div>
            <div className="flex gap-4">
              <span className="text-gray-400 w-24">E-posta</span>
              <span className="text-white">{user?.email || '—'}</span>
            </div>
          </div>
        </div>

        {/* Şifre değiştir */}
        <div className="bg-gray-800 rounded-xl p-6">
          <h2 className="font-semibold text-white mb-4">Şifre Değiştir</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Mevcut Şifre</label>
              <input type="password" required value={form.oldPassword}
                onChange={(e) => setForm({ ...form, oldPassword: e.target.value })}
                className={inputCls} placeholder="••••••••" />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Yeni Şifre</label>
              <input type="password" required value={form.newPassword}
                onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
                className={inputCls} placeholder="En az 8 karakter" />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Yeni Şifre (Tekrar)</label>
              <input type="password" required value={form.confirmPassword}
                onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                className={inputCls} placeholder="••••••••" />
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            {success && <p className="text-green-400 text-sm">{success}</p>}
            <button type="submit" disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium py-2 rounded-lg transition-colors">
              {loading ? 'Değiştiriliyor...' : 'Şifreyi Değiştir'}
            </button>
          </form>
        </div>
      </div>
    </CustomerLayout>
  )
}
