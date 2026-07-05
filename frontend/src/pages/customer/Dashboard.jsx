import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import CustomerLayout from '../../components/CustomerLayout'
import { createCampaign, getActiveCampaign } from '../../api/customer'

const MAX_CHARS = 1000

function WhatsAppPreview({ message, imagePreview }) {
  const preview = message
    ? message.replace(/\{\{visitorname\}\}/gi, 'Ahmet')
    : ''
  const hasContent = preview || imagePreview

  return (
    <div className="bg-[#0b141a] rounded-xl h-full min-h-64 flex flex-col">
      <div className="bg-[#202c33] px-4 py-3 rounded-t-xl flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center text-xs text-white">WA</div>
        <div>
          <p className="text-white text-sm font-medium">WhatsApp Önizleme</p>
          <p className="text-gray-400 text-xs">çevrimiçi</p>
        </div>
      </div>
      <div className="flex-1 p-4 overflow-y-auto">
        {hasContent ? (
          <div className="flex justify-end">
            <div className="bg-[#005c4b] text-white text-sm rounded-l-xl rounded-tr-xl overflow-hidden max-w-xs shadow">
              {imagePreview && (
                <img src={imagePreview} alt="preview" className="w-full max-h-48 object-cover" />
              )}
              {preview && (
                <div className="px-3 py-2">
                  <p className="whitespace-pre-wrap break-words">{preview}</p>
                  <p className="text-[10px] text-green-300 mt-1 text-right">12:00 ✓✓</p>
                </div>
              )}
              {!preview && imagePreview && (
                <p className="text-[10px] text-green-300 px-3 pb-2 text-right">12:00 ✓✓</p>
              )}
            </div>
          </div>
        ) : (
          <p className="text-gray-600 text-xs text-center mt-8">Mesaj önizlemesi burada görünecek</p>
        )}
      </div>
    </div>
  )
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('manual')
  const [title, setTitle] = useState('')
  const [manualList, setManualList] = useState('')
  const [file, setFile] = useState(null)
  const [message, setMessage] = useState('')
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [activeCampaign, setActiveCampaign] = useState(null)
  const [loading, setLoading] = useState(false)
  const [checkingActive, setCheckingActive] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  function handleImageChange(e) {
    const f = e.target.files[0] || null
    setImageFile(f)
    if (f) {
      const reader = new FileReader()
      reader.onload = (ev) => setImagePreview(ev.target.result)
      reader.readAsDataURL(f)
    } else {
      setImagePreview(null)
    }
  }

  function removeImage() {
    setImageFile(null)
    setImagePreview(null)
  }

  useEffect(() => {
    getActiveCampaign()
      .then((c) => setActiveCampaign(c))
      .catch(() => {})
      .finally(() => setCheckingActive(false))
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (tab === 'manual' && !manualList.trim()) {
      setError('Numara listesi boş olamaz'); return
    }
    if (tab === 'file' && !file) {
      setError('Lütfen bir CSV veya Excel dosyası seçin'); return
    }

    setLoading(true)
    try {
      const fd = new FormData()
      fd.append('title', title)
      fd.append('messageTemplate', message)
      if (tab === 'manual') fd.append('manualList', manualList)
      else fd.append('file', file)
      if (imageFile) fd.append('image', imageFile)

      const result = await createCampaign(fd)
      setSuccess(`Kampanya başlatıldı! ${result.totalCount} alıcı kuyruğa eklendi.`)
      setActiveCampaign(result)
      setTimeout(() => navigate('/campaign/active'), 1500)
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.errors?.[0]?.msg || 'Hata oluştu')
    } finally {
      setLoading(false)
    }
  }

  if (checkingActive) {
    return <CustomerLayout><div className="text-gray-500 text-center py-20">Yükleniyor...</div></CustomerLayout>
  }

  return (
    <CustomerLayout>
      <h1 className="text-2xl font-bold text-white mb-6">Kampanya Oluştur</h1>

      {activeCampaign && (
        <div className="bg-yellow-900/30 border border-yellow-700 rounded-xl px-5 py-4 mb-6 flex items-center justify-between">
          <div>
            <p className="text-yellow-400 font-medium text-sm">Aktif bir kampanyanız var</p>
            <p className="text-yellow-300/70 text-xs mt-0.5">"{activeCampaign.title}" — yeni kampanya başlatmak için önce aktif kampanyanın bitmesini bekleyin.</p>
          </div>
          <button onClick={() => navigate('/campaign/active')}
            className="text-yellow-400 hover:text-yellow-300 text-sm whitespace-nowrap ml-4">
            Takip Et →
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="flex gap-6">
          {/* Sol panel */}
          <div className="flex-1 space-y-5">
            {/* Kampanya başlığı */}
            <div>
              <label className="block text-sm text-gray-400 mb-1">Kampanya Başlığı</label>
              <input type="text" required value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                placeholder="Haziran Kampanyası"
              />
            </div>

            {/* Numara girişi */}
            <div className="bg-gray-800 rounded-xl overflow-hidden">
              <div className="flex border-b border-gray-700">
                <button type="button"
                  onClick={() => setTab('manual')}
                  className={`flex-1 py-2.5 text-sm font-medium transition-colors ${tab === 'manual' ? 'text-white bg-gray-700' : 'text-gray-400 hover:text-white'}`}>
                  Manuel Giriş
                </button>
                <button type="button"
                  onClick={() => setTab('file')}
                  className={`flex-1 py-2.5 text-sm font-medium transition-colors ${tab === 'file' ? 'text-white bg-gray-700' : 'text-gray-400 hover:text-white'}`}>
                  CSV / Excel Yükle
                </button>
              </div>

              <div className="p-4">
                {tab === 'manual' ? (
                  <div>
                    <p className="text-gray-400 text-xs mb-2">Her satıra bir numara yazın. İsim eklemek için: <code className="text-indigo-400">905551234567, Ahmet</code></p>
                    <textarea
                      value={manualList}
                      onChange={(e) => setManualList(e.target.value)}
                      rows={6}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm font-mono placeholder-gray-500 focus:outline-none focus:border-indigo-500 resize-none"
                      placeholder={'905551234567\n905559876543, Ali\n905552223344, Ayşe'}
                    />
                    <p className="text-gray-500 text-xs mt-1">
                      {manualList.split('\n').filter(l => l.trim()).length} satır girildi
                    </p>
                  </div>
                ) : (
                  <div>
                    <p className="text-gray-400 text-xs mb-2">CSV veya Excel dosyası yükleyin. Sütun adları: <code className="text-indigo-400">phone</code>, <code className="text-indigo-400">name</code> (opsiyonel)</p>
                    <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-600 rounded-lg p-6 cursor-pointer hover:border-indigo-500 transition-colors">
                      <span className="text-gray-400 text-sm text-center">
                        {file ? file.name : 'Dosya seçmek için tıklayın veya sürükleyin'}
                      </span>
                      <span className="text-gray-600 text-xs mt-1">.csv, .xlsx, .xls — max 10 MB</span>
                      <input type="file" accept=".csv,.xlsx,.xls" className="hidden"
                        onChange={(e) => setFile(e.target.files[0] || null)} />
                    </label>
                    {file && (
                      <button type="button" onClick={() => setFile(null)} className="text-gray-500 hover:text-red-400 text-xs mt-2">
                        Dosyayı kaldır ×
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Mesaj */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm text-gray-400">Mesaj</label>
                <span className={`text-xs ${message.length > MAX_CHARS ? 'text-red-400' : 'text-gray-500'}`}>
                  {message.length} / {MAX_CHARS}
                </span>
              </div>
              <textarea
                required
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={5}
                maxLength={MAX_CHARS}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-indigo-500 resize-none"
                placeholder="Merhaba {{visitorname}}, kampanyamızdan haberdar etmek istedik..."
              />
              <p className="text-gray-500 text-xs mt-1">
                <code className="text-indigo-400">{'{{visitorname}}'}</code> kullanarak alıcı adını ekleyebilirsiniz
              </p>
            </div>

            {/* Görsel yükleme */}
            <div>
              <label className="block text-sm text-gray-400 mb-1">Görsel (opsiyonel)</label>
              {imagePreview ? (
                <div className="relative inline-block">
                  <img src={imagePreview} alt="seçilen görsel"
                    className="h-24 rounded-lg object-cover border border-gray-700" />
                  <button type="button" onClick={removeImage}
                    className="absolute -top-2 -right-2 bg-red-600 hover:bg-red-700 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs leading-none">
                    ×
                  </button>
                </div>
              ) : (
                <label className="flex items-center gap-3 border border-dashed border-gray-600 rounded-lg px-4 py-3 cursor-pointer hover:border-indigo-500 transition-colors w-full">
                  <span className="text-gray-500 text-sm">
                    Resim seçin (JPG, PNG, WEBP, GIF — max 5 MB)
                  </span>
                  <input type="file" accept="image/jpeg,image/png,image/webp,image/gif"
                    className="hidden" onChange={handleImageChange} />
                </label>
              )}
            </div>

            {error && <p className="text-red-400 text-sm">{error}</p>}
            {success && <p className="text-green-400 text-sm">{success}</p>}

            <button
              type="submit"
              disabled={loading || !!activeCampaign}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-3 rounded-xl transition-colors"
            >
              {loading ? 'Kampanya başlatılıyor...' : activeCampaign ? 'Aktif kampanya var — bekleyin' : 'Kampanyayı Başlat'}
            </button>
          </div>

          {/* Sağ panel — WhatsApp Önizleme */}
          <div className="w-72 flex-shrink-0">
            <p className="text-sm text-gray-400 mb-2">Önizleme</p>
            <WhatsAppPreview message={message} imagePreview={imagePreview} />
          </div>
        </div>
      </form>
    </CustomerLayout>
  )
}
