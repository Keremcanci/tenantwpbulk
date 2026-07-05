import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'

// Admin
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/admin/Login'
import Dashboard from './pages/admin/Dashboard'
import WhatsappAccounts from './pages/admin/WhatsappAccounts'
import WhatsappAdd from './pages/admin/WhatsappAdd'
import Customers from './pages/admin/Customers'
import CustomerNew from './pages/admin/CustomerNew'
import CustomerDetail from './pages/admin/CustomerDetail'

// Customer
import CustomerProtectedRoute from './components/CustomerProtectedRoute'
import CustomerLogin from './pages/customer/Login'
import CustomerDashboard from './pages/customer/Dashboard'
import ActiveCampaign from './pages/customer/ActiveCampaign'
import Reports from './pages/customer/Reports'
import ReportDetail from './pages/customer/ReportDetail'
import Settings from './pages/customer/Settings'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Root redirect */}
        <Route path="/" element={<Navigate to="/login" replace />} />

        {/* Customer routes */}
        <Route path="/login" element={<CustomerLogin />} />
        <Route path="/dashboard" element={<CustomerProtectedRoute><CustomerDashboard /></CustomerProtectedRoute>} />
        <Route path="/campaign/active" element={<CustomerProtectedRoute><ActiveCampaign /></CustomerProtectedRoute>} />
        <Route path="/reports" element={<CustomerProtectedRoute><Reports /></CustomerProtectedRoute>} />
        <Route path="/reports/:id" element={<CustomerProtectedRoute><ReportDetail /></CustomerProtectedRoute>} />
        <Route path="/settings" element={<CustomerProtectedRoute><Settings /></CustomerProtectedRoute>} />

        {/* Admin routes */}
        <Route path="/admin/login" element={<Login />} />
        <Route path="/admin/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/admin/whatsapp" element={<ProtectedRoute><WhatsappAccounts /></ProtectedRoute>} />
        <Route path="/admin/whatsapp/add" element={<ProtectedRoute><WhatsappAdd /></ProtectedRoute>} />
        <Route path="/admin/customers" element={<ProtectedRoute><Customers /></ProtectedRoute>} />
        <Route path="/admin/customers/new" element={<ProtectedRoute><CustomerNew /></ProtectedRoute>} />
        <Route path="/admin/customers/:id" element={<ProtectedRoute><CustomerDetail /></ProtectedRoute>} />

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
