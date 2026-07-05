import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import Layout from '../../components/Layout'
import { getDashboard, getActiveCampaigns, stopCampaign } from '../../api/admin'

function StatCard({ label, value, sub, color = 'indigo' }) {
  const colors = { indigo: 'text-indigo-400', green: 'text-green-400', yellow: 'text-yellow-400', red: 'text-red-400' }
  return (
    <div className="bg-gray-800 rounded-xl p-5">
      <p className="text-gray-400 text-sm">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${colors[color]}`}>{value}</p>
      {sub && <p className="text-gray-500 text-xs mt-1">{sub}</p>}
    </div>
  )
}

const statusColor = {
  connected: 'text-green-400',
  pending: 'text-yellow-400',
  running: 'text-blue-400',
  failed: 'text-red-400',
  completed: 'text-gray-400',
}

export default function Dashboard() {
  const [dash, setDash] = useState(null)
  const [campaigns, setCampaigns] = useState([])
  const [stopping, setStopping] = useState(null)

  async function load() {
    try {
      const [d, c] = await Promise.all([getDashboard(), getActiveCampaigns()])
      setDash(d)
      setCampaigns(c)
    } catch {}
  }

  useEffect(() => { load() }, [])

  async function handleStop(id) {
    if (!confirm('Kampanyayı durdurmak istediğinizden emin misiniz?')) return
    setStopping(id)
    try {
      await stopCampaign(id)
      await load()
    } catch (err) {
      alert(err.response?.data?.error || 'Hata oluştu')
    } finally {
      setStopping(null)
    }
  }

  return (
    <Layout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <button onClick={load} className="text-sm text-gray-400 hover:text-white">Yenile</button>
      </div>

      {dash ? (
        <>
          {/* Üst istatistikler */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard label="Bugün Gönderilen" value={dash.today_messages_sent.toLocaleString()} color="green" />
            <StatCard label="Aktif Kampanya" value={dash.active_campaigns} color="yellow" />
            <StatCard label="Kuyrukta Bekleyen" value={dash.queue_waiting.toLocaleString()} color="indigo" />
            <StatCard label="Bağlı Hesap" value={dash.whatsapp_accounts.connected} color="green" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            {/* WA Hesap Durumu */}
            <div className="bg-gray-800 rounded-xl p-5">
              <h2 className="font-semibold text-white mb-4">WhatsApp Hesapları</h2>
              <div className="space-y-2 text-sm">
                {[
                  { label: 'Bağlı (Aktif)', val: dash.whatsapp_accounts.connected, cls: 'text-green-400' },
                  { label: 'Yedek', val: dash.whatsapp_accounts.backup, cls: 'text-blue-400' },
                  { label: 'Banlı', val: dash.whatsapp_accounts.banned, cls: 'text-red-400' },
                  { label: 'Bağlı Değil', val: dash.whatsapp_accounts.disconnected, cls: 'text-gray-400' },
                ].map((row) => (
                  <div key={row.label} className="flex justify-between">
                    <span className="text-gray-400">{row.label}</span>
                    <span className={`font-bold ${row.cls}`}>{row.val}</span>
                  </div>
                ))}
              </div>
              <Link to="/admin/whatsapp" className="block mt-4 text-indigo-400 text-xs hover:underline">
                Tüm hesapları gör →
              </Link>
            </div>

            {/* Sunucu Sağlığı */}
            <div className="bg-gray-800 rounded-xl p-5">
              <h2 className="font-semibold text-white mb-4">Sunucu Sağlığı</h2>
              <div className="space-y-3 text-sm">
                {[
                  { label: 'CPU', value: `${dash.server_health.cpu_percent}%`, pct: dash.server_health.cpu_percent },
                  { label: 'RAM', value: `${dash.server_health.ram_used_gb} / ${dash.server_health.ram_total_gb} GB`, pct: Math.round(dash.server_health.ram_used_gb / dash.server_health.ram_total_gb * 100) },
                ].map((row) => (
                  <div key={row.label}>
                    <div className="flex justify-between mb-1">
                      <span className="text-gray-400">{row.label}</span>
                      <span className="text-white">{row.value}</span>
                    </div>
                    <div className="h-1.5 bg-gray-700 rounded-full">
                      <div
                        className={`h-full rounded-full ${row.pct > 80 ? 'bg-red-500' : row.pct > 60 ? 'bg-yellow-500' : 'bg-green-500'}`}
                        style={{ width: `${Math.min(row.pct, 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
                <div className="flex justify-between">
                  <span className="text-gray-400">Redis Bellek</span>
                  <span className="text-white">{dash.server_health.redis_memory_mb} MB</span>
                </div>
              </div>
            </div>
          </div>

          {/* Aktif Kampanyalar */}
          {campaigns.length > 0 && (
            <div className="bg-gray-800 rounded-xl p-5">
              <h2 className="font-semibold text-white mb-4">Aktif Kampanyalar</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-400 text-left border-b border-gray-700">
                      <th className="pb-2">Başlık</th>
                      <th className="pb-2">Müşteri</th>
                      <th className="pb-2">Durum</th>
                      <th className="pb-2">İlerleme</th>
                      <th className="pb-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700">
                    {campaigns.map((c) => (
                      <tr key={c.id}>
                        <td className="py-3 text-white">{c.title}</td>
                        <td className="py-3 text-gray-400">{c.user?.email}</td>
                        <td className={`py-3 font-medium ${statusColor[c.status] || 'text-gray-400'}`}>{c.status}</td>
                        <td className="py-3 text-gray-400">{c.successCount}/{c.totalCount}</td>
                        <td className="py-3">
                          <button
                            onClick={() => handleStop(c.id)}
                            disabled={stopping === c.id}
                            className="text-red-400 hover:text-red-300 text-xs disabled:opacity-50"
                          >
                            {stopping === c.id ? 'Durduruluyor...' : 'Durdur'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="flex items-center justify-center h-48 text-gray-500">Yükleniyor...</div>
      )}
    </Layout>
  )
}
