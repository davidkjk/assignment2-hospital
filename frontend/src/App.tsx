import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { RequireRole } from './auth/RequireRole'
import { ADMIN_ONLY, RECEPTION_AND_ADMIN, homeFor } from './auth/roles'
import { useAuth } from './auth/useAuth'
import { LoginPage } from './pages/LoginPage'
import { PasswordResetNewPage } from './pages/PasswordResetNewPage'
import { PasswordResetRequestPage } from './pages/PasswordResetRequestPage'
import { Queue } from './pages/queue/Queue'
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
import { MessagesPage } from './pages/messages/MessagesPage'
import { SettingsPage } from './pages/admin/settings/SettingsPage'
import { PatientSearchPage } from './pages/patients/PatientSearchPage'
import { CalendarPage } from './pages/calendar/CalendarPage'
import { Today } from './pages/today/Today'
import { Tickets } from './pages/tickets/Tickets'
import { TicketDetail } from './pages/tickets/TicketDetail'
import { staffChatDetailApi } from './api/staffChatDetail'
import { ChatlogPage } from './pages/chatlog/ChatlogPage'
import { KbPage, type KbPrefill } from './pages/bot/knowledge/KbPage'
import { UnresolvedPage } from './pages/bot/unresolved/UnresolvedPage'
import { ReportsPage } from './pages/bot/reports/ReportsPage'
import { QualityPage } from './pages/bot/quality/QualityPage'
import { BadReportPage } from './pages/chatlog/BadReportPage'
import { AppShell } from './shell/AppShell'
import { NAV_ITEMS } from './shell/navItems'

function LoginRoute() {
  const { loading, session, staff } = useAuth()
  if (loading) return <p role="status">로그인 정보를 확인하는 중입니다</p>
  if (session && staff) return <Navigate to={homeFor(staff.role)} replace />
  return <LoginPage />
}

// 상담봇 관련 화면은 4단계(상담봇) 산출물이라 이 단계(직원웹)에선 아직 비어 있다.
// 시연에서 "안 됨"이 아니라 "다음 단계 제공"으로 읽히도록 로드맵 문구를 보여준다.
// (/tickets 문의 티켓함은 상담봇 Task 16에서 실제 화면으로 채워졌다 — placeholder에서 제외.)
const CHATBOT_PATHS = new Set<string>(['/bot/overview'])

function Placeholder({ title, note }: { title: string; note?: string }) {
  return <section><h1>{title}</h1><p>{note ?? '이 화면의 본문은 후속 화면 태스크에서 연결됩니다.'}</p></section>
}

// 캘린더는 역할(⚙ 팔레트 관리는 관리자만·CAL-COLOR-04)과 staffId(줌 사람별 기억)를
// 실제 세션에서 받아야 해 useAuth를 읽는 얇은 래퍼로 배선한다.
function CalendarRoute() {
  const { staff } = useAuth()
  return <CalendarPage staffKey={staff?.staffId ?? 'staff'} isAdmin={staff?.role === 'admin'} />
}

// 상담봇 기록·티켓 상세의 「잘못된 답변 신고」 → 오답 신고 작성(별도 전체 화면)으로. 왔던 곳·스크롤·필터를 state로 들고 간다(B2).
function useReportBad(back: string) {
  const navigate = useNavigate()
  return (messageId: string, restore?: unknown) =>
    navigate(`/chatlog/report/${messageId}`, { state: { return: { back, scroll: window.scrollY, restore } } })
}

function ChatlogRoute() {
  const location = useLocation()
  const reportBad = useReportBad('/chatlog')
  const st = location.state as { restore?: { filters?: Record<string, string> }; scroll?: number } | null
  return <ChatlogPage onReportBad={reportBad} initialFilters={st?.restore?.filters} initialScroll={st?.scroll} />
}

function KbRoute() {
  const location = useLocation()
  const prefill = (location.state as { prefill?: KbPrefill } | null)?.prefill
  return <KbPage prefill={prefill} />
}

function TicketsRoute() {
  const reportBad = useReportBad('/tickets')
  return (
    <Tickets
      detailSlot={(t, { backToList }) =>
        t ? (
          <TicketDetail key={t.id} api={staffChatDetailApi} ticket={t} onLoserBackToList={backToList} onReportBad={(id) => reportBad(id)} />
        ) : (
          <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
            왼쪽에서 문의를 고르면 대화와 인계 요약이 여기에 열립니다
          </div>
        )
      }
    />
  )
}

function pageFor(path: string, label: string) {
  if (path === '/today') return <Today />
  if (path === '/patients') return <PatientSearchPage />
  if (path === '/queue') return <Queue />
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
  if (path === '/messages') return <MessagesPage />
  if (path === '/admin/settings') return <SettingsPage />
  if (path === '/calendar') return <CalendarRoute />
  if (path === '/chatlog') return <ChatlogRoute />
  if (path === '/bot/knowledge') return <KbRoute />
  if (path === '/bot/unresolved') return <UnresolvedPage />
  if (path === '/bot/reports') return <ReportsPage />
  if (path === '/bot/quality') return <QualityPage />
  if (path === '/tickets') return <TicketsRoute />
  if (CHATBOT_PATHS.has(path)) return <Placeholder title={label} note="상담봇 기능은 다음 개발 단계(상담봇)에서 제공될 예정입니다." />
  return <Placeholder title={label} />
}

export function App() {
  return (
    <>
      <style>{`@layer base{*{box-sizing:border-box}html,body,#root{margin:0;min-height:100%;font-family:'Pretendard Variable',Pretendard,-apple-system,BlinkMacSystemFont,system-ui,sans-serif}button,input{font:inherit}a{color:var(--color-primary)}button:focus-visible,a:focus-visible,input:focus-visible{outline:3px solid var(--color-primary);outline-offset:2px}}`}</style>
      <Routes>
        <Route path="/login" element={<LoginRoute />} />
        <Route path="/reset-password" element={<PasswordResetRequestPage />} />
        <Route path="/reset-password/new" element={<PasswordResetNewPage />} />
        <Route path="/" element={<RequireRole roles={['receptionist', 'doctor', 'admin']}><AppShell /></RequireRole>}>
          {NAV_ITEMS.map((item) => <Route key={item.path} path={item.path.slice(1)} element={<RequireRole roles={item.roles}>{pageFor(item.path, item.label)}</RequireRole>} />)}
          <Route path="chatlog/report/:messageId" element={<RequireRole roles={RECEPTION_AND_ADMIN}><BadReportPage /></RequireRole>} />
          <Route path="patients/:id" element={<RequireRole roles={['receptionist', 'doctor', 'admin']}><PatientDetailPage /></RequireRole>} />
          <Route path="admin/merge-history/:mergeEventId" element={<RequireRole roles={ADMIN_ONLY}><MergeEventDetail /></RequireRole>} />
          <Route path="doctor/console/:appointmentId" element={<RequireRole roles={['doctor']}><DoctorConsolePage /></RequireRole>} />
        </Route>
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </>
  )
}
