import { Navigate, Route, Routes } from 'react-router-dom'
import { RequireRole } from './auth/RequireRole'
import { homeFor } from './auth/roles'
import { useAuth } from './auth/useAuth'
import { LoginPage } from './pages/LoginPage'
import { PasswordResetNewPage } from './pages/PasswordResetNewPage'
import { PasswordResetRequestPage } from './pages/PasswordResetRequestPage'
import { QueuePage } from './pages/QueuePage'
import { TodayPage } from './pages/TodayPage'
import { AppShell } from './shell/AppShell'
import { NAV_ITEMS } from './shell/navItems'

function LoginRoute() {
  const { loading, session, staff } = useAuth()
  if (loading) return <p role="status">로그인 정보를 확인하는 중입니다</p>
  if (session && staff) return <Navigate to={homeFor(staff.role)} replace />
  return <LoginPage />
}

function Placeholder({ title }: { title: string }) {
  return <section><h1>{title}</h1><p>이 화면의 본문은 후속 화면 태스크에서 연결됩니다.</p></section>
}

function pageFor(path: string, label: string) {
  if (path === '/today') return <TodayPage />
  if (path === '/queue') return <QueuePage />
  return <Placeholder title={label} />
}

export function App() {
  return (
    <>
      <style>{`*{box-sizing:border-box}html,body,#root{margin:0;min-height:100%;font-family:Pretendard,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}button,input{font:inherit}a{color:var(--color-primary)}button:focus-visible,a:focus-visible,input:focus-visible{outline:3px solid var(--color-primary);outline-offset:2px}`}</style>
      <Routes>
        <Route path="/login" element={<LoginRoute />} />
        <Route path="/reset-password" element={<PasswordResetRequestPage />} />
        <Route path="/reset-password/new" element={<PasswordResetNewPage />} />
        <Route path="/" element={<RequireRole roles={['receptionist', 'doctor', 'admin']}><AppShell /></RequireRole>}>
          {NAV_ITEMS.map((item) => <Route key={item.path} path={item.path.slice(1)} element={<RequireRole roles={item.roles}>{pageFor(item.path, item.label)}</RequireRole>} />)}
          <Route path="patients/:id" element={<RequireRole roles={['receptionist', 'doctor', 'admin']}><Placeholder title="환자 상세" /></RequireRole>} />
        </Route>
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </>
  )
}
