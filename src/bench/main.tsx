import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import '../App.css'
import './bench.css'
import { BenchPage } from './BenchPage'

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <BenchPage />
    </StrictMode>,
)
