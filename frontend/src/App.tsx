import { Navigate, Route, Routes } from 'react-router-dom'
import { RequireRole } from './auth/RequireRole'
import { ADMIN_ONLY, homeFor } from './auth/roles'
import { useAuth } from './auth/useAuth'
import { LoginPage } from './pages/LoginPage'
import { PasswordResetNewPage } from './pages/PasswordResetNewPage'
import { PasswordResetRequestPage } from './pages/PasswordResetRequestPage'
import { QueuePage } from './pages/QueuePage'
import { PatientDetailPage } from './pages/patient/PatientDetailPage'
import { DoctorConsolePage } from './pages/doctor/DoctorConsolePage'
import { StatsPage } from './pages/admin/StatsPage'
import { AccessLogPage } from './pages/admin/AccessLogPage'
import { SchedulePage } from './pages/admin/schedule/SchedulePage'
import { StaffAdminPage } from './pages/admin/staff/StaffAdminPage'
import { CheckInPage } from './pages/checkin/CheckInPage'
import { MergeCandidatesPage } from './pages/admin/merge/MergeCandidatesPage'
import { MergeHistoryPage } from './pages/admin/merge-history/MergeHistoryPage'
import { MergeEventDetail } from './pages/admin/merge-history/MergeEventDetail'
import { QuestionnaireAdminPage } from './pages/admin/questionnaires/QuestionnaireAdminPage'
import { ErrorLogPage } from './pages/admin/errors/ErrorLogPage'
import { PatientSearchPage } from './pages/patients/PatientSearchPage'
import { CalendarPage } from './pages/calendar/CalendarPage'
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

// 캘린더는 역할(⚙ 팔레트 관리는 관리자만·CAL-COLOR-04)과 staffId(줌 사람별 기억)를
// 실제 세션에서 받아야 해 useAuth를 읽는 얇은 래퍼로 배선한다.
function CalendarRoute() {
  const { staff } = useAuth()
  return <CalendarPage staffKey={staff?.staffId ?? 'staff'} isAdmin={staff?.role === 'admin'} />
}

function pageFor(path: string, label: string) {
  if (path === '/today') return <TodayPage />
  if (path === '/patients') return <PatientSearchPage />
  if (path === '/queue') return <QueuePage />
  if (path === '/doctor/console') return <DoctorConsolePage />
  if (path === '/admin/stats') return <StatsPage />
  if (path === '/admin/access-logs') return <AccessLogPage />
  if (path === '/admin/schedule') return <SchedulePage />
  if (path === '/admin/staff') return <StaffAdminPage />
  if (path === '/checkin') return <CheckInPage />
  if (path === '/admin/patient-merge-candidates') return <MergeCandidatesPage />
  if (path === '/admin/merge-history') return <MergeHistoryPage />
  if (path === '/admin/questionnaires') return <QuestionnaireAdminPage />
  if (path === '/admin/errors') return <ErrorLogPage />
  if (path === '/calendar') return <CalendarRoute />
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
          <Route path="patients/:id" element={<RequireRole roles={['receptionist', 'doctor', 'admin']}><PatientDetailPage /></RequireRole>} />
          <Route path="admin/merge-history/:mergeEventId" element={<RequireRole roles={ADMIN_ONLY}><MergeEventDetail /></RequireRole>} />
          <Route path="doctor/console/:appointmentId" element={<RequireRole roles={['doctor']}><DoctorConsolePage /></RequireRole>} />
        </Route>
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </>
  )
}
