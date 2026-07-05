import { NavLink, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import useCustomerStore from '../store/customerStore'
import { logout, getProfile } from '../api/customer'

const navItems = [
  { to: '/dashboard', label: 'Kampanya Oluştur', icon: '📤' },
  { to: '/campaign/active', label: 'Aktif Kampanya', icon: '⚡' },
  { to: '/reports', label: 'Raporlar', icon: '📊' },
  { to: '/settings', label: 'Ayarlar', icon: '⚙️' },
]

export default function CustomerLayout({ children }) {
  const navigate = useNavigate()
  const { refreshToken, user, setUser, logout: storeLogout } = useCustomerStore()
  const [credit, setCredit] = useState(user?.credit ?? null)

  useEffect(() => {
    getProfile()
      .then((u) => { setUser(u); setCredit(u.credit) })
      .catch(() => {})
  }, [])

  async function handleLogout() {
    try { await logout(refreshToken) } catch {}
    storeLogout()
    navigate('/login')
  }

  return (
    <div className="flex min-h-screen bg-gray-900">
      {/* Sidebar */}
      <aside className="w-56 bg-gray-800 flex flex-col">
        <div className="px-5 py-5 border-b border-gray-700">
          <p className="text-white font-bold text-base">WA Panel</p>
          <p className="text-gray-400 text-xs mt-0.5 truncate">{user?.fullName || user?.email}</p>
        </div>

        <nav className="flex-1 py-4 space-y-1 px-2">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-indigo-600 text-white'
                    : 'text-gray-400 hover:bg-gray-700 hover:text-white'
                }`
              }
            >
              <span>{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="px-4 py-4 border-t border-gray-700">
          <div className="bg-gray-700/50 rounded-lg px-3 py-2 mb-3">
            <p className="text-gray-400 text-xs">Kredi Bakiyesi</p>
            <p className={`text-lg font-bold mt-0.5 ${credit === 0 ? 'text-red-400' : 'text-green-400'}`}>
              {credit === null ? '—' : credit.toLocaleString()}
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="text-gray-500 hover:text-white text-xs w-full text-left"
          >
            Çıkış Yap →
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 p-8 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}
