import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { StaffPage } from '../../components/staff-ui'
import { badReportApi, type BadReportApi } from '../../api/badReport'
import { BadReportForm, type ReturnContext } from './BadReportForm'

// 직원 오답 신고 작성 화면(/chatlog/report/:messageId) — 상담봇 기록·티켓 상세의 「잘못된 답변 신고」에서 별도 전체 화면으로(NAV-STFSUP-06).
// 저장·취소 뒤 왔던 화면(location.state.back)으로 직전 필터·스크롤을 들고 돌아간다(B2·NAV-STFSUP-13).

export interface BadReportReturn {
  back: string
  scroll?: number
  restore?: unknown
}

export function BadReportPage({ api = badReportApi }: { api?: BadReportApi }) {
  const { messageId } = useParams<{ messageId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const ret = (location.state as { return?: BadReportReturn } | null)?.return
  const back = ret?.back ?? '/chatlog'

  const goBack = (ctx: ReturnContext) => navigate(back, { state: { restore: ret?.restore, scroll: ctx.scroll } })

  return (
    <StaffPage max="max-w-3xl" testid="bad-report">
      <BadReportForm api={api} messageId={messageId ?? null} onDone={goBack} onCancel={goBack} returnScroll={ret?.scroll} />
    </StaffPage>
  )
}
