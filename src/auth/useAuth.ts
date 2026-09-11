import { useContext } from 'react'
import { AuthContext } from './context'

export function useAuth() {
  const kontext = useContext(AuthContext)
  if (!kontext) throw new Error('useAuth braucht einen <AuthProvider> darüber.')
  return kontext
}
