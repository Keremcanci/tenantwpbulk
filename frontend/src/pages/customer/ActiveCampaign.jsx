import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import CustomerLayout from '../../components/CustomerLayout'
import { getActiveCampaign } from '../../api/customer'
import useCustomerStore from '../../store/customerStore'

function useWsCampaignProgress(campaignId, token, onMessage) {
  useEffect(() => {
    if (!campaignId || !token) return
    const url = `ws://localhost:3001/ws/customer/campaigns/${campaignId}/progress?token=${token}`
    const ws = new WebSocket(url)
    ws.onmessage = (e) => {
      try { onMessage(JSON.parse(e.data)) } catch {}
    }
    return () => ws.close()
  }, [campaignId, token])
}

const statusLabel = {
  pending: 'Kuyrukta bekliyor...',
  running: 'Gönderim devam ediyor...',
  completed: 'Kampanya tamamlandı',
  failed: 'Kampanya başarısız',
}

const statusColor = {
  pending: 'text-yellow-400',
  running: 'text-blue-400',
  completed: 'text-green-400',
  failed: 'text-red-400',
}

export default function ActiveCampaign() {
  const navigate = useNavigate()
  const token = useCustomerStore((s) => s.accessToken)
  const [campaign, setCampaign] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getActiveCampaign()
      .then((c) => {
        if (!c) navigate('/dashboard')
        else setCampaign(c)
      })
      .catch(() => navigate('/dashboard'))
      .finally(() => setLoading(false))
  }, [])

  const handleWsMessage = useCallback((data) => {
    if (data.event === 'connected') return
    setCampaign((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        status: data.status ?? prev.status,
        successCount: data.successCount ?? prev.successCount,
        failedCount: data.failedCount ?? prev.failedCount,
      }
    })
  }, [])

  useWsCampaignProgress(campaign?.id, token, handleWsMessage)

  if (loading) return <CustomerLayout><div className="text-gray-500 text-center py-20">Yükleniyor...</div></CustomerLayout>
  if (!campaign) return null

  const pct = campaign.totalCount > 0
    ? Math.round(((campaign.successCount + campaign.failedCount) / campaign.totalCount) * 100)
    : 0
  const done = campaign.status === 'completed' || campaign.status === 'failed'

  return (
    <CustomerLayout>
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <h1 className="text-2xl font-bold text-white flex-1">{campaign.title}</h1>
          <span className={`text-sm font-medium ${statusColor[campaign.status] || 'text-gray-400'}`}>
            {statusLabel[campaign.status] || campaign.status}
          </span>
        </div>

        {/* Progress bar */}
        <div className="bg-gray-800 rounded-xl p-6 mb-5">
          <div className="flex justify-between text-xs text-gray-400 mb-2">
            <span>İlerleme</span>
            <span>{pct}%</span>
          </div>
          <div className="h-3 bg-gray-700 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${done ? 'bg-green-500' : 'bg-indigo-500'}`}
              style={{ width: `${pct}%` }}
            />
          </div>

          {/* Sayaçlar */}
          <div className="grid grid-cols-3 gap-4 mt-5">
            <div className="text-center">
              <p className="text-2xl font-bold text-white">{campaign.totalCount}</p>
              <p className="text-gray-400 text-xs mt-0.5">Toplam</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-green-400">{campaign.successCount}</p>
              <p className="text-gray-400 text-xs mt-0.5">Başarılı</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-red-400">{campaign.failedCount}</p>
              <p className="text-gray-400 text-xs mt-0.5">Başarısız</p>
            </div>
          </div>
        </div>

        {/* Tamamlandı mesajı */}
        {campaign.status === 'completed' && (
          <div className="bg-green-900/20 border border-green-800 rounded-xl px-5 py-4 mb-5">
            <p className="text-green-400 font-medium">Kampanya tamamlandı!</p>
          </div>
        )}

        {campaign.status === 'failed' && (
          <div className="bg-red-900/20 border border-red-800 rounded-xl px-5 py-4 mb-5">
            <p className="text-red-400 font-medium">Kampanya başarısız oldu.</p>
          </div>
        )}

        {/* Canlı gösterge */}
        {!done && (
          <div className="flex items-center gap-2 text-gray-400 text-sm">
            <span className="inline-block w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
            Veriler canlı güncelleniyor...
          </div>
        )}

        {done && (
          <div className="flex gap-3 mt-4">
            <button onClick={() => navigate('/dashboard')}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg text-sm">
              Yeni Kampanya Oluştur
            </button>
            <button onClick={() => navigate('/reports')}
              className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded-lg text-sm">
              Raporları Gör
            </button>
          </div>
        )}
      </div>
    </CustomerLayout>
  )
}
