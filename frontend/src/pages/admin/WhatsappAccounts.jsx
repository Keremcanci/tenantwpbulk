import { useState, useEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import Layout from '../../components/Layout'
import { getWAAccounts, getWAAccount, disconnectWAAccount, updateWAAccountType, connectWAAccount, provisionWAAccount, bulkProvisionWAAccounts } from '../../api/admin'
import { useWebSocket } from '../../hooks/useWebSocket'

const statusDot = {
  connected: 'bg-green-500',
  connecting: 'bg-yellow-500 animate-pulse',
  disconnected: 'bg-gray-500',
  banned: 'bg-red-500',
  suspended: 'bg-orange-500',
}

const statusLabel = {
  connected: 'Bağlı',
  connecting: 'Bağlanıyor...',
  disconnected: 'Bağlı Değil',
  banned: 'Banlı',
  suspended: 'Askıya Alındı',
}

export default function WhatsappAccounts() {
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState({})
  const [pairingCode, setPairingCode] = useState({})
  const [provisioning, setProvisioning] = useState(false)
  const [provisionMsg, setProvisionMsg] = useState('')
  const [showBulkModal, setShowBulkModal] = useState(false)
  const [bulkForm, setBulkForm] = useState({ count: 10, proxyHost: '', proxyPort: '', proxyUser: '', proxyPass: '' })
  const [bulkLoading, setBulkLoading] = useState(false)
  const [bulkMsg, setBulkMsg] = useState('')
  const pollRef = useRef(null)

  async function load() {
    try {
      setAccounts(await getWAAccounts())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  // WS: durum güncellemeleri
  const handleWsMsg = useCallback((msg) => {
    if (msg.event === 'statusChange') {
      setAccounts((prev) =>
        prev.map((a) => (a.id === msg.accountId ? { ...a, status: msg.status } : a))
      )
    }
  }, [])

  async function handleConnect(id) {
    setConnecting((p) => ({ ...p, [id]: true }))
    setPairingCode((p) => ({ ...p, [id]: null }))
    try {
      const data = await connectWAAccount(id)
      setPairingCode((p) => ({ ...p, [id]: data.pairingCode }))
      setAccounts((prev) => prev.map((a) => (a.id === id ? { ...a, status: 'connecting' } : a)))
    } catch (err) {
      alert(err.response?.data?.error || 'Bağlantı başlatılamadı')
    } finally {
      setConnecting((p) => ({ ...p, [id]: false }))
    }
  }

  async function handleDisconnect(id) {
    try {
      await disconnectWAAccount(id)
      setAccounts((prev) => prev.map((a) => (a.id === id ? { ...a, status: 'disconnected' } : a)))
      setPairingCode((p) => ({ ...p, [id]: null }))
    } catch (err) {
      alert(err.response?.data?.error || 'Hata')
    }
  }

  async function handleTypeToggle(id, currentType) {
    const newType = currentType === 'active' ? 'backup' : 'active'
    try {
      await updateWAAccountType(id, newType)
      setAccounts((prev) => prev.map((a) => (a.id === id ? { ...a, type: newType } : a)))
    } catch {}
  }

  // 5SIM otomatik numara kurulumu
  async function handleProvision() {
    setProvisioning(true)
    setProvisionMsg('5SIM\'den numara alınıyor...')
    try {
      const account = await provisionWAAccount()
      setAccounts((prev) => [account, ...prev])
      setProvisionMsg('SMS kodu bekleniyor... (max 5 dk)')

      // Hesap bağlanana kadar 5sn'de bir poll et
      pollRef.current = setInterval(async () => {
        try {
          const updated = await getWAAccount(account.id)
          setAccounts((prev) => prev.map((a) => (a.id === updated.id ? { ...a, status: updated.status } : a)))

          if (updated.status === 'connected') {
            clearInterval(pollRef.current)
            setProvisioning(false)
            setProvisionMsg('')
          } else if (updated.status === 'banned' || updated.status === 'disconnected') {
            clearInterval(pollRef.current)
            setProvisioning(false)
            setProvisionMsg('Kurulum başarısız — hesap bağlanamadı.')
            setTimeout(() => setProvisionMsg(''), 5000)
          }
        } catch {}
      }, 5000)

      // 6 dakika sonra timeout
      setTimeout(() => {
        if (pollRef.current) {
          clearInterval(pollRef.current)
          setProvisioning(false)
          setProvisionMsg('Kurulum zaman aşımına uğradı.')
          setTimeout(() => setProvisionMsg(''), 5000)
        }
      }, 360000)
    } catch (err) {
      setProvisioning(false)
      setProvisionMsg(err.response?.data?.error || '5SIM kurulumu başarısız')
      setTimeout(() => setProvisionMsg(''), 5000)
    }
  }

  async function handleBulkProvision(e) {
    e.preventDefault()
    setBulkLoading(true)
    setBulkMsg('')
    try {
      const payload = {
        count: parseInt(bulkForm.count),
        proxyHost: bulkForm.proxyHost || undefined,
        proxyPort: bulkForm.proxyPort ? parseInt(bulkForm.proxyPort) : undefined,
        proxyUser: bulkForm.proxyUser || undefined,
        proxyPass: bulkForm.proxyPass || undefined,
      }
      await bulkProvisionWAAccounts(payload)
      setBulkMsg(`${payload.count} hesap arka planda kuruluyor. Her 30 saniyede bir başlatılıyor, bu sayfayı yenilerek takip edebilirsiniz.`)
      setShowBulkModal(false)
      // 10sn sonra listeyi yenile
      setTimeout(() => load(), 10000)
    } catch (err) {
      setBulkMsg(err.response?.data?.error || 'Hata oluştu')
    } finally {
      setBulkLoading(false)
    }
  }

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

  return (
    <Layout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">WhatsApp Hesapları</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={handleProvision}
            disabled={provisioning}
            className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm transition-colors flex items-center gap-2"
          >
            {provisioning ? (
              <><span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> Kuruluyor...</>
            ) : '⚡ Otomatik Kur (5SIM)'}
          </button>
          <button
            onClick={() => setShowBulkModal(true)}
            className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm transition-colors"
          >
            Toplu Kur
          </button>
          <Link
            to="/admin/whatsapp/add"
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm transition-colors"
          >
            + Manuel Ekle
          </Link>
        </div>
      </div>

      {/* Toplu Kur Modal */}
      {showBulkModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-white">Toplu 5SIM Kurulum</h2>
              <button onClick={() => setShowBulkModal(false)} className="text-gray-400 hover:text-white text-xl">×</button>
            </div>
            <form onSubmit={handleBulkProvision} className="space-y-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Kaç Hesap? (maks. 100)</label>
                <input
                  type="number" min="1" max="100" required
                  value={bulkForm.count}
                  onChange={(e) => setBulkForm((p) => ({ ...p, count: e.target.value }))}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-purple-500 text-sm"
                />
              </div>
              <div className="border-t border-gray-700 pt-3">
                <p className="text-xs text-gray-400 mb-3">Proxy Ayarları (niceproxy.io)</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Host</label>
                    <input type="text" value={bulkForm.proxyHost}
                      onChange={(e) => setBulkForm((p) => ({ ...p, proxyHost: e.target.value }))}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-purple-500 text-sm"
                      placeholder="proxy.niceproxy.io" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Port</label>
                    <input type="number" value={bulkForm.proxyPort}
                      onChange={(e) => setBulkForm((p) => ({ ...p, proxyPort: e.target.value }))}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-purple-500 text-sm"
                      placeholder="8000" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Kullanıcı</label>
                    <input type="text" value={bulkForm.proxyUser}
                      onChange={(e) => setBulkForm((p) => ({ ...p, proxyUser: e.target.value }))}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-purple-500 text-sm"
                      placeholder="username" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Şifre</label>
                    <input type="text" value={bulkForm.proxyPass}
                      onChange={(e) => setBulkForm((p) => ({ ...p, proxyPass: e.target.value }))}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-purple-500 text-sm"
                      placeholder="password" />
                  </div>
                </div>
              </div>
              <p className="text-xs text-gray-500">Her hesap arasında 30 saniye beklenir. {bulkForm.count} hesap ≈ {Math.ceil((bulkForm.count - 1) * 0.5)} dakika.</p>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowBulkModal(false)}
                  className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded-lg text-sm">
                  İptal
                </button>
                <button type="submit" disabled={bulkLoading}
                  className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white py-2 rounded-lg text-sm">
                  {bulkLoading ? 'Başlatılıyor...' : 'Kurulumu Başlat'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {bulkMsg && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm ${bulkMsg.includes('Hata') || bulkMsg.includes('hata') ? 'bg-red-900/30 text-red-400 border border-red-800' : 'bg-purple-900/30 text-purple-300 border border-purple-800'}`}>
          {bulkMsg}
        </div>
      )}

      {provisionMsg && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm ${provisionMsg.includes('başarısız') || provisionMsg.includes('zaman') ? 'bg-red-900/30 text-red-400 border border-red-800' : 'bg-blue-900/30 text-blue-300 border border-blue-800'}`}>
          {provisionMsg}
        </div>
      )}

      {loading ? (
        <div className="text-gray-500 py-12 text-center">Yükleniyor...</div>
      ) : accounts.length === 0 ? (
        <div className="bg-gray-800 rounded-xl p-12 text-center">
          <p className="text-gray-400 mb-4">Henüz WhatsApp hesabı eklenmemiş.</p>
          <div className="flex justify-center gap-3">
            <button onClick={handleProvision} className="text-emerald-400 hover:underline text-sm">
              5SIM ile otomatik kur →
            </button>
            <Link to="/admin/whatsapp/add" className="text-indigo-400 hover:underline text-sm">
              Manuel ekle →
            </Link>
          </div>
        </div>
      ) : (
        <div className="bg-gray-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-400 text-left border-b border-gray-700">
                <th className="px-4 py-3">Durum</th>
                <th className="px-4 py-3">Numara</th>
                <th className="px-4 py-3">İsim</th>
                <th className="px-4 py-3">Tip</th>
                <th className="px-4 py-3">Mesaj (Bugün)</th>
                <th className="px-4 py-3">Proxy</th>
                <th className="px-4 py-3">İşlemler</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {accounts.map((acc) => (
                <>
                  <tr key={acc.id} className="hover:bg-gray-750">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${statusDot[acc.status] || 'bg-gray-500'}`} />
                        <span className="text-gray-300">{statusLabel[acc.status] || acc.status}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-white">{acc.phoneNumber || '—'}</td>
                    <td className="px-4 py-3 text-gray-300">{acc.displayName || '—'}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleTypeToggle(acc.id, acc.type)}
                        className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                          acc.type === 'active'
                            ? 'border-green-600 text-green-400 hover:bg-green-900/30'
                            : 'border-blue-600 text-blue-400 hover:bg-blue-900/30'
                        }`}
                      >
                        {acc.type === 'active' ? 'Aktif' : 'Yedek'}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-gray-400">
                      {acc.dailyMessageCount} / {acc.dailyMessageLimit}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {acc.proxyHost ? `${acc.proxyHost}:${acc.proxyPort}` : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        {acc.status === 'connected' ? (
                          <button
                            onClick={() => handleDisconnect(acc.id)}
                            className="text-xs text-red-400 hover:text-red-300"
                          >
                            Kes
                          </button>
                        ) : acc.status !== 'banned' ? (
                          <button
                            onClick={() => handleConnect(acc.id)}
                            disabled={connecting[acc.id]}
                            className="text-xs text-green-400 hover:text-green-300 disabled:opacity-50"
                          >
                            {connecting[acc.id] ? 'Bağlanıyor...' : 'Bağlan'}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                  {pairingCode[acc.id] && (
                    <tr key={`code-${acc.id}`} className="bg-indigo-900/20">
                      <td colSpan={7} className="px-4 py-3">
                        <p className="text-sm text-indigo-300">
                          WhatsApp uygulamasında{' '}
                          <strong>Bağlantılı Cihazlar → Cihaz Bağla</strong> seçeneğine gidin ve
                          aşağıdaki kodu girin:
                        </p>
                        <p className="text-3xl font-mono font-bold text-white mt-2 tracking-widest">
                          {pairingCode[acc.id]}
                        </p>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Layout>
  )
}
