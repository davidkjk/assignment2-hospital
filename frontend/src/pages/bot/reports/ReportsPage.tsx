import { useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { StaffPage } from '../../../components/staff-ui'
import { qualityAdminApi, type QualityApi } from '../../../api/qualityAdmin'
import { BadAnswerInbox, type ApplyToKbTarget } from './BadAnswerInbox'

// 오답 신고 처리함(/bot/reports · 관리자). [반영]은 안내자료 수정·승인 흐름으로 — 처리 완료 뒤 [안내자료 편집으로 가기]가
// 교정 내용을 새 초안으로 들고 안내자료 화면으로 이동한다(승인 전 미반영, BADINBOX-REVIEW-03). ?feedback= 으로 상세를 바로 연다.

export function ReportsPage({ api = qualityAdminApi }: { api?: QualityApi }) {
  const navigate = useNavigate()
  const location = useLocation()
  const selected = new URLSearchParams(location.search).get('feedback')
  const pendingKb = useRef<ApplyToKbTarget | null>(null)

  return (
    <StaffPage max="max-w-full" testid="bot-reports">
      <BadAnswerInbox
        api={api}
        selectedId={selected}
        onApplyToKb={(t) => {
          pendingKb.current = t
        }}
        onGoToKb={() => {
          const t = pendingKb.current
          navigate('/bot/knowledge', {
            state: t ? { prefill: { title: t.question, category: '자주 묻는 질문', content: t.correction ?? '', from: 'bad-inbox' } } : undefined,
          })
        }}
      />
    </StaffPage>
  )
}
