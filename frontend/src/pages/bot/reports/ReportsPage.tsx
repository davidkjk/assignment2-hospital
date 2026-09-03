import { useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { StaffPage } from '../../../components/staff-ui'
import { qualityAdminApi, type QualityApi } from '../../../api/qualityAdmin'
import { BadAnswerInbox, type ApplyToKbTarget } from './BadAnswerInbox'
import { ExampleBank } from '../quality/ExampleBank'

// 오답 신고 처리함(/bot/reports · 관리자). [반영]은 안내자료 수정·승인 흐름으로 — 처리 완료 뒤 [안내자료 편집으로 가기]가
// 교정 내용을 새 초안으로 들고 안내자료 화면으로 이동한다(승인 전 미반영, BADINBOX-REVIEW-03). ?feedback= 으로 상세를 바로 연다.
// ⭐ 참고 예시(qa_example_bank) 목록도 여기 둔다 — 예시는 이 처리함의 [반영]으로 쌓이는 산출물이라 인과가 붙어 흐름이 닫힌다
//   (사용자 결정 2026-09-02, 품질 리포트에서 이관).

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
      <div className="mt-8">
        <ExampleBank api={api} />
      </div>
    </StaffPage>
  )
}
