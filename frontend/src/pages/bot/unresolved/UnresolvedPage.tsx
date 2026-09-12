import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHead, PeriodSelect, StaffPage, periodRange, type PeriodValue } from '../../../components/staff-ui'
import { qualityAdminApi, type QualityApi } from '../../../api/qualityAdmin'
import { UnresolvedClusters, type AddKbTarget } from './UnresolvedClusters'

// 미해결 질문(/bot/unresolved · 관리자) — 기간 선택기 + 유사 질문 묶음. 상세는 같은 화면을 전체 폭으로 바꿔 연다(05).
// [안내자료로 보강] → 안내자료 화면으로 대표 질문·예시를 들고 이동(새 초안 prefill, 승인 전 미반영 06).

export function UnresolvedPage({ api = qualityAdminApi }: { api?: QualityApi }) {
  const navigate = useNavigate()
  const [period, setPeriod] = useState<PeriodValue>(() => periodRange('최근 30일'))
  const [detailId, setDetailId] = useState<string | null>(null)

  const onAddKb = (t: AddKbTarget) => {
    navigate('/bot/knowledge', {
      state: { prefill: { title: t.representative, category: '자주 묻는 질문', content: t.questions.map((q) => `Q. ${q}`).join('\n'), from: t.from } },
    })
  }

  return (
    <StaffPage max="max-w-4xl" testid="bot-unresolved">
      <PageHead action={<PeriodSelect value={period} onChange={setPeriod} />} />
      <UnresolvedClusters
        api={api}
        range={{ from: period.from, to: period.to }}
        detailClusterId={detailId}
        onOpenDetail={(t) => setDetailId(t.clusterId)}
        onBackFromDetail={() => setDetailId(null)}
        onAddKb={onAddKb}
      />
    </StaffPage>
  )
}
