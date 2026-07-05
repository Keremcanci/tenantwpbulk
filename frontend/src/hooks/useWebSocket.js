import { useEffect, useRef, useCallback } from 'react'
import useAuthStore from '../store/authStore'

export function useWebSocket(path, onMessage) {
  const ws = useRef(null)
  const token = useAuthStore((s) => s.accessToken)

  const connect = useCallback(() => {
    if (!token || !path) return
    const url = `ws://localhost:3001${path}?token=${token}`
    ws.current = new WebSocket(url)
    ws.current.onmessage = (e) => {
      try { onMessage(JSON.parse(e.data)) } catch {}
    }
    ws.current.onerror = () => {}
    ws.current.onclose = () => {}
  }, [path, token, onMessage])

  useEffect(() => {
    connect()
    return () => ws.current?.close()
  }, [connect])
}
