// 본문 서체 — 데모와 같은 Pretendard 웹폰트(설치 안 하면 시스템 글꼴로 대체돼 글자 인상이 달라진다).
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css'
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
