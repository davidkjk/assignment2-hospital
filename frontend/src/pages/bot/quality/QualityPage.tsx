import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHead, PeriodSelect, StaffPage, periodRange, type PeriodValue } from '../../../components/staff-ui'
import { qualityAdminApi, type QualityApi } from '../../../api/qualityAdmin'
import { QualityReport } from './QualityReport'

// 상담 품질 리포트(/bot/quality · 관리자) — 기간 선택기 + 상담 목록/우측 교정 패널(데모 Quality.tsx 구성).
// 교정 저장 뒤 [처리함으로 가기 ›]는 오답 신고 처리함으로(QUALITY-REPORT-08).
// ⭐ 참고 예시(qa_example_bank) 목록은 오답처리함(/bot/reports)으로 옮겼다 — 그 처리함 [반영]의 산출물이라
//   인과가 붙는다(사용자 결정 2026-09-02).

export function QualityPage({ api = qualityAdminApi }: { api?: QualityApi }) {
  const navigate = useNavigate()
  const [period, setPeriod] = useState<PeriodValue>(() => periodRange('최근 30일'))

  return (
    <StaffPage max="max-w-full" testid="bot-quality">
      <PageHead action={<PeriodSelect value={period} onChange={setPeriod} />} />
      <div className="mb-6">
        <QualityReport api={api} range={{ from: period.from, to: period.to }} onGoToInbox={() => navigate('/bot/reports')} />
      </div>
    </StaffPage>
  )
}
