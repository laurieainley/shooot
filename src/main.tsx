import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { installStaleBuildRecovery } from './staleBuildRecovery'

import { initCrashNote } from './crashNoteRuntime'

initCrashNote()
installStaleBuildRecovery()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
