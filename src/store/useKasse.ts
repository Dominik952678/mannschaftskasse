import { useContext } from 'react'
import { KasseContext } from './context'

export function useKasse() {
  const store = useContext(KasseContext)
  if (!store) throw new Error('useKasse braucht einen <KasseProvider> darüber.')
  return store
}
