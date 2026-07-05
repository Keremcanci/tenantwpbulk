import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import Layout from '../../components/Layout'
import { getCustomers } from '../../api/admin'

export default function Customers() {
  const [data, setData] = useState({ customers: [], total: 0, pages: 1 })
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)

  async function load(p = page) {
    setLoading(true)
    try {
      setData(await getCustomers(p))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load(page) }, [page])

  return (
    <Layout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Müşteriler</h1>
        <Link
          to="/admin/customers/new"
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm transition-colors"
        >
          + Müşteri Oluştur
        </Link>
      </div>

      <div className="bg-gray-800 rounded-xl overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-gray-500">Yükleniyor...</div>
        ) : data.customers.length === 0 ? (
          <div className="py-16 text-center text-gray-400">Henüz müşteri yok.</div>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-400 text-left border-b border-gray-700">
                  <th className="px-4 py-3">Ad Soyad</th>
                  <th className="px-4 py-3">E-posta</th>
                  <th className="px-4 py-3">Kredi</th>
                  <th className="px-4 py-3">Durum</th>
                  <th className="px-4 py-3">Kayıt Tarihi</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {data.customers.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-750">
                    <td className="px-4 py-3 text-white font-medium">{c.fullName}</td>
                    <td className="px-4 py-3 text-gray-300">{c.email}</td>
                    <td className="px-4 py-3">
                      <span className={`font-bold ${c.credit > 0 ? 'text-green-400' : 'text-gray-500'}`}>
                        {c.credit.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${c.isActive ? 'bg-green-900/40 text-green-400' : 'bg-red-900/40 text-red-400'}`}>
                        {c.isActive ? 'Aktif' : 'Pasif'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400">
                      {new Date(c.createdAt).toLocaleDateString('tr-TR')}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        to={`/admin/customers/${c.id}`}
                        className="text-indigo-400 hover:text-indigo-300 text-xs"
                      >
                        Detay →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {data.pages > 1 && (
              <div className="px-4 py-3 border-t border-gray-700 flex items-center justify-between text-sm">
                <span className="text-gray-400">Toplam: {data.total} müşteri</span>
                <div className="flex gap-2">
                  <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                    className="px-3 py-1 bg-gray-700 rounded disabled:opacity-40 text-gray-300 hover:bg-gray-600">
                    ←
                  </button>
                  <span className="px-2 text-gray-400">{page} / {data.pages}</span>
                  <button onClick={() => setPage((p) => Math.min(data.pages, p + 1))} disabled={page === data.pages}
                    className="px-3 py-1 bg-gray-700 rounded disabled:opacity-40 text-gray-300 hover:bg-gray-600">
                    →
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  )
}
