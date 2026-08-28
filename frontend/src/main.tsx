import './styles/tokens.css'
import './styles/theme.css'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { App } from './App'
import { AuthProvider } from './auth/AuthProvider'
import { ConnectivityProvider } from './lib/connectivity'
import { queryClient } from './lib/queryClient'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ConnectivityProvider>
        <BrowserRouter>
          <AuthProvider><App /></AuthProvider>
        </BrowserRouter>
      </ConnectivityProvider>
    </QueryClientProvider>
  </React.StrictMode>,
)
