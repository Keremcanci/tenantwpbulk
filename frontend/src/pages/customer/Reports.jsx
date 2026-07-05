import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import CustomerLayout from '../../components/CustomerLayout'
import { listCampaigns } from '../../api/customer'

const statusLabel = { pending: 'Bekliyor', running: 'Devam Ediyor', completed: 'Tamamlandı', failed: 'Başarısız' }
const statusColor = {
  pending: 'bg-yellow-900/40 text-yellow-400',
  running: 'bg-blue-900/40 text-blue-400',
  completed: 'bg-green-900/40 text-green-400',
  failed: 'bg-red-900/40 text-red-400',
}

export default function Reports() {
  const navigate = useNavigate()
  const [data, setData] = useState({ campaigns: [], total: 0, pages: 1 })
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    listCampaigns(page)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [page])

  return (
    <CustomerLayout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Raporlar</h1>
        <p className="text-gray-400 text-sm">Toplam {data.total} kampanya</p>
      </div>

      {loading ? (
        <div className="text-gray-500 text-center py-20">Yükleniyor...</div>
      ) : data.campaigns.length === 0 ? (
        <div className="bg-gray-800 rounded-xl p-12 text-center">
          <p className="text-gray-400 text-sm">Henüz kampanya oluşturmadınız.</p>
          <button onClick={() => navigate('/dashboard')}
            className="mt-4 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg text-sm">
            Kampanya Oluştur
          </button>
        </div>
      ) : (
        <div className="bg-gray-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-400 text-left border-b border-gray-700">
                <th className="px-4 py-3">Kampanya</th>
                <th className="px-4 py-3">Tarih</th>
                <th className="px-4 py-3">Toplam</th>
                <th className="px-4 py-3">Başarılı</th>
                <th className="px-4 py-3">Başarısız</th>
                <th className="px-4 py-3">Kredi</th>
                <th className="px-4 py-3">Durum</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {data.campaigns.map((c) => (
                <tr key={c.id} className="hover:bg-gray-700/30 transition-colors">
                  <td className="px-4 py-3 text-white font-medium">{c.title}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {new Date(c.createdAt).toLocaleString('tr-TR')}
                  </td>
                  <td className="px-4 py-3 text-gray-300">{c.totalCount}</td>
                  <td className="px-4 py-3 text-green-400">{c.successCount}</td>
                  <td className="px-4 py-3 text-red-400">{c.failedCount}</td>
                  <td className="px-4 py-3 text-red-400 text-xs">-{c.creditUsed}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${statusColor[c.status]}`}>
                      {statusLabel[c.status] || c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => navigate(`/reports/${c.id}`)}
                      className="text-indigo-400 hover:text-indigo-300 text-xs">
                      Detay →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Sayfalama */}
          {data.pages > 1 && (
            <div className="px-4 py-3 border-t border-gray-700 flex items-center justify-between">
              <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
                className="text-gray-400 hover:text-white text-sm disabled:opacity-40">
                ← Önceki
              </button>
              <span className="text-gray-400 text-xs">{page} / {data.pages}</span>
              <button disabled={page >= data.pages} onClick={() => setPage(p => p + 1)}
                className="text-gray-400 hover:text-white text-sm disabled:opacity-40">
                Sonraki →
              </button>
            </div>
          )}
        </div>
      )}
    </CustomerLayout>
  )
}
