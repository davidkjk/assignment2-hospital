// data-testid: staff-access-logs
import { useMemo, useState } from 'react'

import { ChevronDown, ChevronRight, Eye, FileText, Phone, Search, ShieldCheck } from '@/components/icons'

import { maskBirth, maskPhone } from '../../mockData'
import { EmptyState, PageHead, Panel, SearchInput, StaffPage, StatusBadge, Tag, Toolbar, btnGhost } from '../../_ui'
import { accessLogs, type AccessAction } from './mockData'

const actionOptions: Array<AccessAction | '전체'> = [
  '전체',
  '환자정보 열람',
  '진료기록 열람',
  '번호 열람',
  '검색',
  '대량 번호 열람',
  '병합',
  '병합 되돌림',
  '통계 상세 열람',
  '통계 CSV 내보내기',
]

const actionTone: Record<AccessAction, 'gray' | 'sky' | 'violet' | 'amber' | 'teal' | 'green'> = {
  '환자정보 열람': 'sky',
  '진료기록 열람': 'violet',
  '번호 열람': 'amber',
  검색: 'teal',
  '대량 번호 열람': 'amber',
  병합: 'green',
  '병합 되돌림': 'gray',
  '통계 상세 열람': 'sky',
  '통계 CSV 내보내기': 'violet',
}

function ActionIcon({ action }: { action: AccessAction }) {
  const className = 'h-4 w-4'
  if (action === '검색') return <Search className={className} />
  if (action === '번호 열람' || action === '대량 번호 열람') return <Phone className={className} />
  if (action === '진료기록 열람') return <FileText className={className} />
  return <Eye className={className} />
}

export function AccessLogs() {
  const [from, setFrom] = useState('2026-08-01')
  const [to, setTo] = useState('2026-08-22')
  const [staff, setStaff] = useState('전체')
  const [action, setAction] = useState<AccessAction | '전체'>('전체')
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  const rows = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    return accessLogs.filter((row) => {
      const matchesDate = row.date >= from && row.date <= to
      const matchesStaff = staff === '전체' || row.staff === staff
      const matchesAction = action === '전체' || row.action === action
      const patientText = row.patient ? `${row.patient.name} ${maskBirth(row.patient.birth)} ${maskPhone(row.patient.phone)}` : ''
      const matchesQuery = !keyword || `${patientText} ${row.reason} ${row.detail ?? ''}`.toLowerCase().includes(keyword)
      return matchesDate && matchesStaff && matchesAction && matchesQuery
    })
  }, [action, from, query, staff, to])

  return (
    <StaffPage testid="staff-access-logs" max="max-w-7xl">
      <PageHead title="환자정보 열람 기록" sub="누가 어떤 환자 정보를 언제 열었는지 확인합니다" />

      <Panel className="mb-4">
        <div className="flex items-start gap-3 text-sm">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div>
            <p className="font-semibold">이 기록은 삭제하거나 수정할 수 없습니다</p>
            <p className="mt-0.5 text-xs text-muted-foreground">검색은 실행 1회당 한 줄, 번호 보기는 실제로 마스킹을 해제한 환자마다 별도 기록됩니다. 최신 첫 페이지 최대 200건입니다.</p>
          </div>
        </div>
      </Panel>

      <Toolbar
        left={
          <>
            <input aria-label="시작일" type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="h-9 rounded-lg border border-input bg-card px-3 text-sm" />
            <span className="text-muted-foreground">~</span>
            <input aria-label="종료일" type="date" value={to} onChange={(event) => setTo(event.target.value)} className="h-9 rounded-lg border border-input bg-card px-3 text-sm" />
            <select aria-label="직원 필터" value={staff} onChange={(event) => setStaff(event.target.value)} className="h-9 rounded-lg border border-input bg-card px-3 text-sm">
              <option>전체</option><option>김서연</option><option>박지민</option><option>이정훈</option>
            </select>
            <select aria-label="기록 유형 필터" value={action} onChange={(event) => setAction(event.target.value as AccessAction | '전체')} className="h-9 rounded-lg border border-input bg-card px-3 text-sm">
              {actionOptions.map((option) => <option key={option}>{option}</option>)}
            </select>
          </>
        }
        right={<div className="w-64"><SearchInput value={query} onChange={setQuery} placeholder="마스킹 식별자·사유 검색" icon={<Search className="h-4 w-4" />} /></div>}
      />

      <Panel pad="p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div><span className="text-sm font-semibold">최근 200건</span><span className="ml-2 text-xs text-muted-foreground">현재 조건 {rows.length}건</span></div>
          <span className="text-xs text-muted-foreground">병원 시간대 · 최신순</span>
        </div>

        <div className="grid grid-cols-[10.5rem_7rem_1fr_2fr] gap-3 border-b border-border bg-muted px-4 py-2 text-xs font-semibold text-muted-foreground">
          <span>열람 시각</span><span>직원</span><span>대상</span><span>동작 · 사유</span>
        </div>

        {rows.length === 0 ? (
          <EmptyState icon={<Search className="h-5 w-5" />} title="조건에 맞는 접근 기록이 없습니다" hint="기간을 넓히거나 직원·유형 필터를 지워보세요" />
        ) : (
          <div className="divide-y divide-border/60">
            {rows.map((row) => {
              const isGroup = row.action === '대량 번호 열람' && row.groupedPatients
              const isOpen = expanded === row.id
              return (
                <div key={row.id}>
                  <div className="grid grid-cols-[10.5rem_7rem_1fr_2fr] items-start gap-3 px-4 py-3 text-sm">
                    <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">{row.occurredAt}</span>
                    <span className="font-semibold">{row.staff}</span>
                    <div>
                      {row.patient ? (
                        <><div className="font-semibold">{row.patient.name}</div><div className="mt-0.5 text-xs text-muted-foreground">{maskBirth(row.patient.birth)} · {maskPhone(row.patient.phone)}</div></>
                      ) : row.action === '검색' ? (
                        <><Tag>환자 없는 검색 사건</Tag><div className="mt-1 text-xs text-muted-foreground">검색어 원문 미저장</div></>
                      ) : (
                        <Tag>관리자 활동</Tag>
                      )}
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2"><ActionIcon action={row.action} /><StatusBadge status={row.action} tone={actionTone[row.action]} />{row.detail && <Tag>{row.detail}</Tag>}</div>
                      <p className="mt-1.5 text-sm">{row.reason}</p>
                      {row.action === '번호 열람' && <p className="mt-1 text-xs text-muted-foreground">마스킹 해제 경계 · 실제 번호는 이 기록 화면에서 다시 펼치지 않습니다</p>}
                      {isGroup && (
                        <button className={`${btnGhost} mt-2 px-2 py-1 text-xs`} onClick={() => setExpanded(isOpen ? null : row.id)}>
                          {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                          {isOpen ? '개별 기록 접기' : '개별 기록 보기'}
                        </button>
                      )}
                    </div>
                  </div>

                  {isGroup && isOpen && (
                    <div className="border-t border-border/60 bg-muted px-4 py-2 pl-[18.5rem]">
                      <p className="mb-2 text-xs text-muted-foreground">저장은 환자별 전수 기록이며, 여기서는 같은 직원·시각·행동을 묶어 표시합니다. 아래는 예시 3건입니다.</p>
                      <div className="divide-y divide-border/60 rounded-lg border border-border bg-card">
                        {row.groupedPatients!.map((patient) => (
                          <div key={`${patient.name}-${patient.occurredAt}`} className="flex items-center justify-between px-3 py-2 text-xs">
                            <span className="font-medium">{patient.name} · {maskBirth(patient.birth)}</span>
                            <span className="tabular-nums text-muted-foreground">{row.date.replaceAll('-', '.')} {patient.occurredAt}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Panel>
    </StaffPage>
  )
}
