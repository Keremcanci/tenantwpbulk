import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import CustomerLayout from '../../components/CustomerLayout'
import { getCampaign } from '../../api/customer'

const statusLabel = { pending: 'Bekliyor', running: 'Devam Ediyor', completed: 'Tamamlandı', failed: 'Başarısız' }
const statusColor = {
  pending: 'bg-yellow-900/40 text-yellow-400',
  running: 'bg-blue-900/40 text-blue-400',
  completed: 'bg-green-900/40 text-green-400',
  failed: 'bg-red-900/40 text-red-400',
}

export default function ReportDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [campaign, setCampaign] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getCampaign(id)
      .then(setCampaign)
      .catch(() => navigate('/reports'))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return <CustomerLayout><div className="text-gray-500 text-center py-20">Yükleniyor...</div></CustomerLayout>
  if (!campaign) return null

  const pct = campaign.totalCount > 0
    ? Math.round((campaign.successCount / campaign.totalCount) * 100)
    : 0

  return (
    <CustomerLayout>
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate('/reports')} className="text-gray-400 hover:text-white">←</button>
          <h1 className="text-2xl font-bold text-white flex-1">{campaign.title}</h1>
          <span className={`text-xs px-2 py-0.5 rounded-full ${statusColor[campaign.status]}`}>
            {statusLabel[campaign.status] || campaign.status}
          </span>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-4 mb-5">
          <div className="bg-gray-800 rounded-xl p-5">
            <p className="text-gray-400 text-xs">Toplam Alıcı</p>
            <p className="text-3xl font-bold text-white mt-1">{campaign.totalCount}</p>
          </div>
          <div className="bg-gray-800 rounded-xl p-5">
            <p className="text-gray-400 text-xs">Başarı Oranı</p>
            <p className={`text-3xl font-bold mt-1 ${pct >= 80 ? 'text-green-400' : pct >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
              %{pct}
            </p>
          </div>
          <div className="bg-gray-800 rounded-xl p-5">
            <p className="text-gray-400 text-xs">Başarılı</p>
            <p className="text-3xl font-bold text-green-400 mt-1">{campaign.successCount}</p>
          </div>
          <div className="bg-gray-800 rounded-xl p-5">
            <p className="text-gray-400 text-xs">Başarısız</p>
            <p className="text-3xl font-bold text-red-400 mt-1">{campaign.failedCount}</p>
          </div>
        </div>

        {/* Kredi bilgisi */}
        <div className="bg-gray-800 rounded-xl p-5 mb-5">
          <h2 className="font-semibold text-white mb-3">Kredi Bilgisi</h2>
          <div className="flex gap-6">
            <div>
              <p className="text-gray-400 text-xs">Kullanılan Kredi</p>
              <p className="text-red-400 font-bold text-lg mt-0.5">-{campaign.creditUsed}</p>
            </div>
          </div>
        </div>

        {/* Mesaj şablonu */}
        <div className="bg-gray-800 rounded-xl p-5 mb-5">
          <h2 className="font-semibold text-white mb-3">Mesaj Şablonu</h2>
          <pre className="text-gray-300 text-sm whitespace-pre-wrap font-sans">{campaign.messageTemplate}</pre>
        </div>

        {/* Meta */}
        <div className="text-gray-500 text-xs space-y-1">
          <p>Oluşturulma: {new Date(campaign.createdAt).toLocaleString('tr-TR')}</p>
          {campaign.startedAt && <p>Başlangıç: {new Date(campaign.startedAt).toLocaleString('tr-TR')}</p>}
          {campaign.completedAt && <p>Bitiş: {new Date(campaign.completedAt).toLocaleString('tr-TR')}</p>}
          {campaign.whatsappAccount && (
            <p>Kullanılan Hesap: {campaign.whatsappAccount.displayName || campaign.whatsappAccount.phoneNumber}</p>
          )}
        </div>
      </div>
    </CustomerLayout>
  )
}
