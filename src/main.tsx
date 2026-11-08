import './tracing'
import './console-capture'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster } from 'sonner'
import App from './App'
import { NearProvider } from './lib/near'
import { installShareSync } from './lib/share'
import './index.css'

installShareSync()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <NearProvider>
      <App />
      <Toaster position="top-center" />
    </NearProvider>
  </StrictMode>,
)
