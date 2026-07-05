import { Navigate } from 'react-router-dom'
import useCustomerStore from '../store/customerStore'

export default function CustomerProtectedRoute({ children }) {
  const token = useCustomerStore((s) => s.accessToken)
  if (!token) return <Navigate to="/login" replace />
  return children
}
