import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../../components/Layout'
import { createCustomer } from '../../api/admin'

export default function CustomerNew() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: '', fullName: '' })
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const data = await createCustomer(form.email, form.fullName)
      setResult(data)
    } catch (err) {
      setError(err.response?.data?.error || 'Hata oluştu')
    } finally {
      setLoading(false)
    }
  }

  const inputCls = 'w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500'

  if (result) {
    return (
      <Layout>
        <div className="max-w-md mx-auto">
          <h1 className="text-2xl font-bold text-white mb-6">Müşteri Oluşturuldu</h1>
          <div className="bg-gray-800 rounded-xl p-6 space-y-4">
            <div className="bg-green-900/20 border border-green-800 rounded-lg p-4">
              <p className="text-green-400 text-sm font-medium mb-1">Müşteri başarıyla oluşturuldu</p>
              <p className="text-gray-400 text-xs">Aşağıdaki şifre yalnızca bir kez gösterilmektedir.</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs mb-1">E-posta</p>
              <p className="text-white font-medium">{result.email}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs mb-1">Ad Soyad</p>
              <p className="text-white font-medium">{result.fullName}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs mb-1">Otomatik Oluşturulan Şifre</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-gray-900 text-yellow-400 font-mono px-3 py-2 rounded-lg text-sm select-all">
                  {result.password}
                </code>
                <button
                  onClick={() => navigator.clipboard.writeText(result.password)}
                  className="text-gray-400 hover:text-white text-xs px-2 py-2 bg-gray-700 rounded"
                >
                  Kopyala
                </button>
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => navigate(`/admin/customers/${result.id}`)}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg text-sm"
              >
                Müşteri Detayına Git
              </button>
              <button
                onClick={() => navigate('/admin/customers')}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded-lg text-sm"
              >
                Listeye Dön
              </button>
            </div>
          </div>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="max-w-md mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate('/admin/customers')} className="text-gray-400 hover:text-white">←</button>
          <h1 className="text-2xl font-bold text-white">Yeni Müşteri</h1>
        </div>

        <div className="bg-gray-800 rounded-xl p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">E-posta</label>
              <input type="email" required value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className={inputCls} placeholder="musteri@example.com" />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Ad Soyad</label>
              <input type="text" required value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                className={inputCls} placeholder="Ali Veli" />
            </div>
            <p className="text-gray-500 text-xs">Şifre otomatik oluşturulur ve oluşturulma ekranında gösterilir.</p>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button type="submit" disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium py-2 rounded-lg transition-colors">
              {loading ? 'Oluşturuluyor...' : 'Müşteri Oluştur'}
            </button>
          </form>
        </div>
      </div>
    </Layout>
  )
}
