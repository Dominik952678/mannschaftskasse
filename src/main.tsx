import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/ds.css'
import './styles/theme.css'
import './styles/app.css'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
