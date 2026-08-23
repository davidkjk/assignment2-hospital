import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertCircle, AlertTriangle, Bell, Send, ShieldCheck } from '@/components/icons'
import { EmptyState, PageHead, StaffPage, StatTile, Tag, btnGhost, btnPrimary } from '../../_ui'

// 시스템 오류 기록 (/staff/admin/errors) — ERRADM-*.
// 관리자 전용·읽기 전용. 3열 고정(발생 시각·기능·오류 내용). 수정·삭제·재실행·해결 버튼 없음(ERRADM-HEAD-02).
// 이중기록 경계(결정19): 수신자별 발송 실패는 여기 없음(발송 이력) · 서비스 전체 장애만 한 줄.
// 오류 내용 = 안전 요약(기술 상세는 redaction, 결정20). data-testid="staff-errors".

interface ErrRow {
  id: string
  at: string // 병원 시간대 절대값 (ERRADM-LIST-02)
  feature: string // API feature 그대로 (ERRADM-LIST-03)
  summary: string // 안전한 요약 (ERRADM-LIST-04)
  service?: boolean // 알림 서비스 전체 장애 (ERRADM-NOTI-02)
}

// 12행 · 기능·요약 다양하게 (품질기준 #3)
const ERRORS: ErrRow[] = [
  { id: 'e1', at: '2026.08.22 09:42:20', feature: '문자 발송', summary: '문자 서비스 전체 장애 — 발송 업체 응답 없음', service: true },
  { id: 'e2', at: '2026.08.22 08:15:03', feature: '예약 동기화', summary: '예약 상태 동기화 작업이 시간 초과로 종료됨' },
  { id: 'e3', at: '2026.08.21 23:10:47', feature: '야간 백업', summary: '자정 백업 작업 중 저장소 용량 부족' },
  { id: 'e4', at: '2026.08.21 17:05:12', feature: '문진 저장', summary: '문진 응답 저장 중 일시적 데이터베이스 연결 오류' },
  { id: 'e5', at: '2026.08.21 14:33:58', feature: 'PDF 생성', summary: '진료 확인서 PDF 생성 실패 — 서식 템플릿 로드 오류' },
  { id: 'e6', at: '2026.08.21 11:20:41', feature: '푸시 알림', summary: '푸시 알림 서비스 전체 장애 — 인증 토큰 만료', service: true },
  { id: 'e7', at: '2026.08.20 19:48:09', feature: '통계 집계', summary: '운영 통계 집계 배치가 예상보다 지연됨' },
  { id: 'e8', at: '2026.08.20 16:02:30', feature: '검색 색인', summary: '환자 검색 색인 갱신 중 부분 실패' },
  { id: 'e9', at: '2026.08.20 10:11:55', feature: '캘린더 조회', summary: '캘린더 대량 조회 응답 지연' },
  { id: 'e10', at: '2026.08.19 22:00:14', feature: '야간 부도 처리', summary: '자정 예약 부도 처리 배치 일시 중단 후 재개' },
  { id: 'e11', at: '2026.08.19 15:27:38', feature: '상담봇 응답', summary: '상담봇 응답 생성 지연 — 지식베이스 조회 시간 초과' },
  { id: 'e12', at: '2026.08.18 09:05:22', feature: '파일 업로드', summary: '첨부 파일 업로드 처리 오류 — 허용되지 않은 형식' },
]

export function Errors() {
  const navigate = useNavigate()
  const [from, setFrom] = useState('2026-08-15')
  const [to, setTo] = useState('2026-08-22')
  const [rangeErr, setRangeErr] = useState('')
  const [applied, setApplied] = useState<{ from: string; to: string }>({ from: '2026-08-15', to: '2026-08-22' })

  const rows = useMemo(() => {
    return ERRORS.filter((r) => {
      const d = r.at.slice(0, 10).replace(/\./g, '-')
      return d >= applied.from && d <= applied.to
    })
  }, [applied])

  const serviceCount = rows.filter((r) => r.service).length

  function runQuery() {
    if (from > to) {
      setRangeErr('종료일은 시작일 이후로 선택해주세요') // ERRADM-FILTER-05
      return
    }
    setRangeErr('')
    setApplied({ from, to })
  }

  return (
    <StaffPage testid="staff-errors" max="max-w-[1200px]">
      <PageHead title="시스템 오류 기록" />

      {/* 읽기 전용 고지 — ERRADM-HEAD-02 */}
      <div className="mb-4 flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div className="text-sm">
          <div className="font-semibold text-foreground">이 기록은 수정하거나 삭제할 수 없습니다</div>
          <div className="mt-0.5 text-muted-foreground">
            오류 내용은 사람이 읽는 안전한 요약입니다. 비밀 키·환자 정보를 지운 기술 상세는 개발자가 뒷단에서 확인합니다.
          </div>
        </div>
      </div>

      {/* 상태 모음판 (목업 83) */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="조회 기간 오류" value={rows.length} tone="neutral" hint="최근 200건 이내" />
        <StatTile label="서비스 전체 장애" value={serviceCount} tone={serviceCount ? 'amber' : 'neutral'} hint="이 화면에만 기록" />
        <StatTile label="관련 기능" value={new Set(rows.map((r) => r.feature)).size} tone="neutral" hint="영향받은 기능 수" />
        <StatTile label="최근 발생" value={rows[0]?.at.slice(5, 10) ?? '—'} tone="neutral" hint="가장 최근 오류일" />
      </div>

      {/* 이중기록 경계 안내 — ERRADM-NOTI-01·02 (결정19) */}
      <div className="mb-3 flex items-start gap-2 rounded-lg border border-border/60 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        <Bell className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          환자 한 명·한 채널의 <strong className="font-medium text-foreground">발송 실패</strong>는 이 기록이 아니라{' '}
          <button onClick={() => navigate('/staff/messages')} className="font-medium text-primary hover:underline">안내 보내기</button>의 발송 이력에 남습니다.
          여기에는 <strong className="font-medium text-foreground">서비스 전체 장애</strong>만 한 줄로 기록됩니다.
        </span>
      </div>

      {/* 기간 필터 (ERRADM-FILTER-02·05) */}
      <div className="mb-3 flex flex-wrap items-end gap-3 rounded-xl border border-border/70 bg-card px-4 py-3 shadow-[0_1px_2px_rgba(16,45,50,0.04)]">
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          조회 기간
          <div className="flex items-center gap-1.5 text-sm text-foreground">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 rounded-lg border border-input bg-card px-2.5 text-sm tabular-nums outline-none focus:border-ring focus:ring-2 focus:ring-ring/40" />
            <span className="text-muted-foreground">~</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 rounded-lg border border-input bg-card px-2.5 text-sm tabular-nums outline-none focus:border-ring focus:ring-2 focus:ring-ring/40" />
          </div>
        </label>
        <button onClick={runQuery} className={btnPrimary}>조회</button>
        {rangeErr && <span className="pb-1.5 text-xs text-rose-600">{rangeErr}</span>}
        <span className="ml-auto pb-1.5 text-xs text-muted-foreground">최근 200건 · 병원 시간대 · 최신순</span>
      </div>

      {/* 3열 고정: 발생 시각·기능·오류 내용 (ERRADM-LIST-01) */}
      <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-[0_1px_2px_rgba(16,45,50,0.04)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/70 bg-muted/40 text-left text-xs font-semibold text-muted-foreground">
              <th className="w-[180px] px-4 py-2.5 font-semibold">발생 시각</th>
              <th className="w-[150px] px-4 py-2.5 font-semibold">기능</th>
              <th className="px-4 py-2.5 font-semibold">오류 내용</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={3}>
                  <EmptyState icon={<AlertCircle className="h-6 w-6" />} title="해당 기간에 오류 기록이 없습니다" hint="기간을 넓혀 다시 조회해보세요" />
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="align-top transition-colors hover:bg-muted/40">
                  <td className="whitespace-nowrap px-4 py-3 tabular-nums text-muted-foreground">{r.at}</td>
                  <td className="px-4 py-3"><Tag>{r.feature}</Tag></td>
                  <td className="px-4 py-3">
                    <div className="flex items-start gap-2">
                      {r.service ? (
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                      ) : (
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                      <div>
                        <span className="text-foreground">{r.summary}</span>
                        {r.service && (
                          <span className="ml-2 inline-flex items-center gap-1 rounded-md bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">
                            <Send className="h-3 w-3" /> 서비스 전체 장애
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex justify-center">
        <button className={btnGhost} disabled>더 오래된 기록 보기</button>
      </div>
    </StaffPage>
  )
}
