import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { StaffPage, PageHead, periodRange } from '../../../components/staff-ui'
import { botStatsApi } from '../../../api/botStats'
import { BotStatsDashboard } from './BotStatsDashboard'

// 상담봇 처리 현황(/bot/overview · 관리자) — 117 통합 화면. 운영 지표(BOTSTAT-DASH) + 많이 들어온 질문(QTOP-RANK)을
// 한 화면에 담는다(116 별도 메뉴 없음, AD-069·MR2-06). 화면 사이 이동은 adminBotNav(NAV-ADM-*)이 계약을 쥔다.
//
// ⚠️ 상담봇 통계·클러스터 집계 API는 대부분 라우터에 없다(소비 계약 선언) → 계약 부재는 '현재 집계할 수 없음'으로 보인다.
//    감사 저장(STAT-AUDIT)·유입원 3분류·k=5 억제의 실제 서버 구현은 배포 게이트(⑦ BLOCKED-BEFORE-MERGE).

export function OverviewPage() {
  const navigate = useNavigate()
  const range = useMemo(() => periodRange('최근 30일'), []) // 기본 기간 — 화면 안에서 다시 고를 수 있다

  return (
    <StaffPage max="max-w-full" testid="bot-overview">
      <PageHead title="상담봇 처리 현황" />
      <BotStatsDashboard
        api={botStatsApi}
        range={{ from: range.from, to: range.to }}
        onAudit={() => {
          // 상담봇 지표 열람·CSV 감사 저장은 배포 게이트(⑦ STAT-AUDIT) — 여기선 payload 경계만 지키고 저장은 아직.
        }}
        onFaqBoost={() => {
          // 반복 질문을 안내자료로 만들기 → KB 편집(승인 전 미반영, NAV-ADM-08). 대표 질문은 편집 화면에서 채운다.
          navigate('/bot/knowledge', {
            state: { prefill: { title: '', category: '자주 묻는 질문', content: '', from: 'ranking-boost' } },
          })
        }}
      />
    </StaffPage>
  )
}
