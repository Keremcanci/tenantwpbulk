import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../../components/Layout'
import { addWAAccount, connectWAAccount } from '../../api/admin'

export default function WhatsappAdd() {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    phoneNumber: '', displayName: '',
    proxyHost: '', proxyPort: '', proxyUser: '', proxyPass: '',
  })
  const [step, setStep] = useState('form') // form | connecting | code
  const [pairingCode, setPairingCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function set(field, value) {
    setForm((p) => ({ ...p, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const payload = {
        phoneNumber: form.phoneNumber.replace(/\D/g, ''),
        displayName: form.displayName || undefined,
        proxyHost: form.proxyHost || undefined,
        proxyPort: form.proxyPort ? parseInt(form.proxyPort) : undefined,
        proxyUser: form.proxyUser || undefined,
        proxyPass: form.proxyPass || undefined,
      }
      const account = await addWAAccount(payload)

      setStep('connecting')
      const result = await connectWAAccount(account.id)
      setPairingCode(result.pairingCode)
      setStep('code')
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Hata oluştu')
      setStep('form')
    } finally {
      setLoading(false)
    }
  }

  const inputCls = 'w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 text-sm'
  const labelCls = 'block text-sm text-gray-400 mb-1'

  if (step === 'connecting') {
    return (
      <Layout>
        <div className="max-w-md mx-auto text-center py-20">
          <div className="text-4xl mb-4 animate-spin">⚙️</div>
          <p className="text-gray-300">Worker ile bağlantı kuruluyor...</p>
          <p className="text-gray-500 text-sm mt-2">Pairing kodu bekleniyor (maks. 30 saniye)</p>
        </div>
      </Layout>
    )
  }

  if (step === 'code') {
    return (
      <Layout>
        <div className="max-w-lg mx-auto">
          <h1 className="text-2xl font-bold text-white mb-6">Bağlantı Kurulacak</h1>
          <div className="bg-gray-800 rounded-xl p-8 text-center">
            <p className="text-gray-300 mb-2">WhatsApp uygulamasında şu adımları izleyin:</p>
            <ol className="text-gray-400 text-sm text-left list-decimal list-inside space-y-1 mb-6">
              <li>WhatsApp'ı açın</li>
              <li>Ayarlar → Bağlantılı Cihazlar → Cihaz Bağla</li>
              <li>Aşağıdaki kodu girin</li>
            </ol>
            <div className="bg-gray-900 rounded-lg p-4 mb-6">
              <p className="text-4xl font-mono font-bold text-white tracking-widest">{pairingCode}</p>
            </div>
            <p className="text-gray-500 text-xs mb-4">Kod telefonunuza girildikten sonra bağlantı otomatik kurulacak.</p>
            <button
              onClick={() => navigate('/admin/whatsapp')}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg text-sm transition-colors"
            >
              Hesap Listesine Dön
            </button>
          </div>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="max-w-lg mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate('/admin/whatsapp')} className="text-gray-400 hover:text-white">←</button>
          <h1 className="text-2xl font-bold text-white">WhatsApp Hesabı Ekle</h1>
        </div>

        <div className="bg-gray-800 rounded-xl p-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className={labelCls}>Telefon Numarası (ülke kodu dahil)</label>
                <input type="text" required value={form.phoneNumber}
                  onChange={(e) => set('phoneNumber', e.target.value)}
                  className={inputCls} placeholder="905551234567" />
              </div>
              <div className="col-span-2">
                <label className={labelCls}>İsim (opsiyonel)</label>
                <input type="text" value={form.displayName}
                  onChange={(e) => set('displayName', e.target.value)}
                  className={inputCls} placeholder="Hesap 1" />
              </div>
            </div>

            <div className="border-t border-gray-700 pt-4">
              <p className="text-gray-400 text-xs mb-3">Proxy Ayarları (opsiyonel)</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Host</label>
                  <input type="text" value={form.proxyHost}
                    onChange={(e) => set('proxyHost', e.target.value)}
                    className={inputCls} placeholder="proxy.example.com" />
                </div>
                <div>
                  <label className={labelCls}>Port</label>
                  <input type="number" value={form.proxyPort}
                    onChange={(e) => set('proxyPort', e.target.value)}
                    className={inputCls} placeholder="1080" />
                </div>
                <div>
                  <label className={labelCls}>Kullanıcı</label>
                  <input type="text" value={form.proxyUser}
                    onChange={(e) => set('proxyUser', e.target.value)}
                    className={inputCls} placeholder="user" />
                </div>
                <div>
                  <label className={labelCls}>Şifre</label>
                  <input type="password" value={form.proxyPass}
                    onChange={(e) => set('proxyPass', e.target.value)}
                    className={inputCls} placeholder="••••••" />
                </div>
              </div>
            </div>

            {error && <p className="text-red-400 text-sm">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium py-2 rounded-lg transition-colors"
            >
              {loading ? 'Kaydediliyor...' : 'Hesabı Ekle ve Bağlan'}
            </button>
          </form>
        </div>
      </div>
    </Layout>
  )
}
