import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Layout from '../../components/Layout'
import { getCustomer, loadCredit, getCreditHistory } from '../../api/admin'

const typeColor = { load: 'text-green-400', deduct: 'text-red-400' }
const typeLabel = { load: 'Yükleme', deduct: 'Kesinti' }

export default function CustomerDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [customer, setCustomer] = useState(null)
  const [history, setHistory] = useState({ transactions: [], total: 0 })
  const [creditForm, setCreditForm] = useState({ amount: '', description: '' })
  const [loading, setLoading] = useState(true)
  const [creditLoading, setCreditLoading] = useState(false)
  const [creditError, setCreditError] = useState('')
  const [creditSuccess, setCreditSuccess] = useState('')

  async function load() {
    try {
      const [c, h] = await Promise.all([getCustomer(id), getCreditHistory(id)])
      setCustomer(c)
      setHistory(h)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [id])

  async function handleCredit(e) {
    e.preventDefault()
    setCreditError('')
    setCreditSuccess('')
    const amount = parseInt(creditForm.amount)
    if (!amount || amount < 1) { setCreditError('Geçerli bir miktar girin'); return }
    setCreditLoading(true)
    try {
      await loadCredit(id, amount, creditForm.description)
      setCreditSuccess(`${amount} kredi yüklendi.`)
      setCreditForm({ amount: '', description: '' })
      load()
    } catch (err) {
      setCreditError(err.response?.data?.error || 'Hata')
    } finally {
      setCreditLoading(false)
    }
  }

  if (loading) return <Layout><div className="text-gray-500 text-center py-20">Yükleniyor...</div></Layout>
  if (!customer) return <Layout><div className="text-gray-500 text-center py-20">Müşteri bulunamadı.</div></Layout>

  return (
    <Layout>
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate('/admin/customers')} className="text-gray-400 hover:text-white">←</button>
          <h1 className="text-2xl font-bold text-white">{customer.fullName}</h1>
          <span className={`text-xs px-2 py-0.5 rounded-full ${customer.isActive ? 'bg-green-900/40 text-green-400' : 'bg-red-900/40 text-red-400'}`}>
            {customer.isActive ? 'Aktif' : 'Pasif'}
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          <div className="bg-gray-800 rounded-xl p-5">
            <p className="text-gray-400 text-xs">Mevcut Kredi</p>
            <p className="text-3xl font-bold text-green-400 mt-1">{customer.credit.toLocaleString()}</p>
          </div>
          <div className="bg-gray-800 rounded-xl p-5 col-span-2">
            <p className="text-gray-400 text-xs mb-2">Hesap Bilgileri</p>
            <p className="text-white text-sm">{customer.email}</p>
            <p className="text-gray-400 text-xs mt-1">
              Kayıt: {new Date(customer.createdAt).toLocaleDateString('tr-TR')} •
              Toplam kampanya: {customer._count?.campaigns ?? '—'}
            </p>
          </div>
        </div>

        {/* Kredi Yükle */}
        <div className="bg-gray-800 rounded-xl p-6 mb-6">
          <h2 className="font-semibold text-white mb-4">Kredi Yükle</h2>
          <form onSubmit={handleCredit} className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="block text-xs text-gray-400 mb-1">Miktar</label>
              <input
                type="number" min="1" required
                value={creditForm.amount}
                onChange={(e) => setCreditForm({ ...creditForm, amount: e.target.value })}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                placeholder="100"
              />
            </div>
            <div className="flex-2 min-w-0 flex-1">
              <label className="block text-xs text-gray-400 mb-1">Açıklama (opsiyonel)</label>
              <input
                type="text"
                value={creditForm.description}
                onChange={(e) => setCreditForm({ ...creditForm, description: e.target.value })}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                placeholder="Haziran ödemesi"
              />
            </div>
            <button
              type="submit" disabled={creditLoading}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-5 py-2 rounded-lg text-sm whitespace-nowrap"
            >
              {creditLoading ? 'Yükleniyor...' : 'Yükle'}
            </button>
          </form>
          {creditError && <p className="text-red-400 text-sm mt-2">{creditError}</p>}
          {creditSuccess && <p className="text-green-400 text-sm mt-2">{creditSuccess}</p>}
        </div>

        {/* Kredi Geçmişi */}
        <div className="bg-gray-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-700">
            <h2 className="font-semibold text-white">Kredi Geçmişi</h2>
            <p className="text-gray-400 text-xs mt-0.5">Toplam {history.total} işlem</p>
          </div>
          {history.transactions.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-8">İşlem yok</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-400 text-left border-b border-gray-700">
                  <th className="px-4 py-2">Tip</th>
                  <th className="px-4 py-2">Miktar</th>
                  <th className="px-4 py-2">Açıklama</th>
                  <th className="px-4 py-2">Tarih</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {history.transactions.map((t) => (
                  <tr key={t.id}>
                    <td className={`px-4 py-2.5 font-medium ${typeColor[t.type]}`}>
                      {typeLabel[t.type]}
                    </td>
                    <td className={`px-4 py-2.5 font-mono ${typeColor[t.type]}`}>
                      {t.type === 'deduct' ? '-' : '+'}{t.amount}
                    </td>
                    <td className="px-4 py-2.5 text-gray-400">{t.description}</td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs">
                      {new Date(t.createdAt).toLocaleString('tr-TR')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </Layout>
  )
}
