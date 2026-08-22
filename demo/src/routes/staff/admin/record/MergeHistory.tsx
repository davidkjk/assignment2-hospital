// data-testid: staff-merge-history
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { AlertTriangle, ArrowLeft, CheckCircle2, ExternalLink, History, LockKeyhole, ShieldCheck, X } from '@/components/icons'

import { PageHead, Panel, StaffPage, StatusBadge, Tag, Toolbar, btnGhost, btnLink, btnPrimary } from '../../_ui'
import { mergeHistory, type MergeHistoryEvent, type MergeHistoryStatus } from './mockData'

const statusTone: Record<MergeHistoryStatus, 'green' | 'gray' | 'amber'> = {
  '되돌림 가능': 'green',
  '되돌림 완료': 'gray',
  되돌림불가: 'amber',
}

function PatientLabel({ label, patient }: { label: string; patient: MergeHistoryEvent['representative'] }) {
  return <div><div className="text-xs text-muted-foreground">{label}</div><div className="mt-0.5 font-semibold">{patient.name} · {patient.displayId}</div></div>
}

export function MergeHistory() {
  const navigate = useNavigate()
  const [status, setStatus] = useState<MergeHistoryStatus | '전체'>('전체')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [acknowledged, setAcknowledged] = useState(false)
  const [completedIds, setCompletedIds] = useState<string[]>([])
  const [auditMemo, setAuditMemo] = useState('')
  const [memoSaved, setMemoSaved] = useState(false)

  const rows = useMemo(() => mergeHistory.filter((event) => status === '전체' || event.status === status), [status])
  const selected = mergeHistory.find((event) => event.id === selectedId) ?? null
  const selectedStatus: MergeHistoryStatus | null = selected
    ? completedIds.includes(selected.id) ? '되돌림 완료' : selected.status
    : null

  const selectEvent = (event: MergeHistoryEvent) => {
    setSelectedId(event.id)
    setReason('')
    setConfirmOpen(false)
    setAcknowledged(false)
    setAuditMemo('')
    setMemoSaved(false)
  }

  const completeUndo = () => {
    if (!selected || !acknowledged || !reason.trim()) return
    setCompletedIds((ids) => [...ids, selected.id])
    setConfirmOpen(false)
    setAcknowledged(false)
  }

  return (
    <StaffPage testid="staff-merge-history" max="max-w-7xl">
      <PageHead title="병합 되돌림 이력" sub="지난 병합을 확인하고, 필요한 경우 관리자 검토를 거쳐 되돌립니다" />

      {!selected ? (
        <>
          <Panel className="mb-4">
            <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><div><p className="text-sm font-semibold">병합과 되돌림은 서로 다른 감사 사건으로 남습니다</p><p className="mt-0.5 text-xs text-muted-foreground">목록 행에서는 즉시 되돌릴 수 없습니다. 상세에서 보존 상태와 사유를 확인한 뒤 확인창을 거칩니다.</p></div></div>
          </Panel>
          <Toolbar
            left={
              <select aria-label="되돌림 상태 필터" value={status} onChange={(event) => setStatus(event.target.value as MergeHistoryStatus | '전체')} className="h-9 rounded-lg border border-input bg-card px-3 text-sm">
                <option>전체</option><option>되돌림 가능</option><option>되돌림 완료</option><option>되돌림불가</option>
              </select>
            }
            right={<span className="text-xs text-muted-foreground">최근 20건 · 병합 시각 최신순</span>}
          />
          <Panel pad="p-0">
            <div className="grid grid-cols-[10.5rem_7rem_1fr_1fr_8rem] gap-3 border-b border-border bg-muted px-4 py-2 text-xs font-semibold text-muted-foreground">
              <span>병합 시각</span><span>실행자</span><span>대표 환자</span><span>병합된 대상</span><span>상태</span>
            </div>
            <div className="divide-y divide-border/60">
              {rows.map((event) => {
                const rowStatus = completedIds.includes(event.id) ? '되돌림 완료' : event.status
                return (
                  <button key={event.id} onClick={() => selectEvent(event)} className="grid w-full grid-cols-[10.5rem_7rem_1fr_1fr_8rem] items-center gap-3 px-4 py-3 text-left text-sm hover:bg-muted">
                    <span className="text-xs tabular-nums text-muted-foreground">{event.mergedAt}</span>
                    <span className="font-semibold">{event.staff}</span>
                    <PatientLabel label={event.id.toUpperCase()} patient={event.representative} />
                    <PatientLabel label="비활성화된 대상" patient={event.merged} />
                    <div><StatusBadge status={rowStatus} tone={statusTone[rowStatus]} /><span className={`${btnLink} mt-1 block`}>상세 보기</span></div>
                  </button>
                )
              })}
            </div>
          </Panel>
        </>
      ) : (
        <>
          <button className={`${btnGhost} mb-3`} onClick={() => setSelectedId(null)}><ArrowLeft className="h-4 w-4" />이력으로 돌아가기</button>
          <div className="mb-3 flex items-center justify-between gap-3"><div><h3 className="text-sm font-semibold">병합 이벤트 상세</h3><p className="text-xs text-muted-foreground">{selected.id.toUpperCase()} · {selected.mergedAt} · {selected.staff}</p></div>{selectedStatus && <StatusBadge status={selectedStatus} tone={statusTone[selectedStatus]} />}</div>

          <div className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
            <div className="space-y-4">
              <Panel title="병합 대상">
                <div className="grid grid-cols-2 gap-3"><div className="rounded-lg bg-primary/10 p-3"><PatientLabel label="대표 환자" patient={selected.representative} /></div><div className="rounded-lg bg-muted p-3"><PatientLabel label="병합된 대상" patient={selected.merged} /></div></div>
              </Panel>
              <Panel title="보존된 기록">
                <p className="text-sm font-medium">{selected.recordCounts}</p>
                <p className="mt-2 text-xs text-muted-foreground">원본 예약·문진·진료기록·수정 이력·기존 감사 행은 삭제되지 않았습니다. 되돌림은 계보 연결을 정정하며 이미 열람된 기록은 되돌릴 수 없습니다.</p>
              </Panel>

              {selectedStatus === '되돌림 가능' && (
                <Panel title="되돌림 사유">
                  <label className="text-xs font-medium text-muted-foreground" htmlFor="undo-reason">필수 · 1~200자</label>
                  <textarea id="undo-reason" value={reason} maxLength={200} onChange={(event) => setReason(event.target.value)} placeholder="오병합으로 판단한 근거를 구체적으로 입력하세요" className="mt-1 min-h-28 w-full resize-none rounded-lg border border-input bg-card p-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40" />
                  <div className="mt-1 flex justify-between text-xs"><span className={reason.trim() ? 'text-muted-foreground' : 'text-primary'}>{reason.trim() ? '확인창에서 한 번 더 검토합니다' : '되돌림 사유를 입력해주세요'}</span><span className="tabular-nums text-muted-foreground">{reason.length}/200</span></div>
                  <div className="mt-3 flex justify-end"><button className={btnGhost} disabled={!reason.trim()} onClick={() => setConfirmOpen(true)}><LockKeyhole className="h-4 w-4" />확인으로 계속</button></div>
                </Panel>
              )}

              {selectedStatus === '되돌림 완료' && (
                <Panel title={<span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary" />되돌림 완료</span>}>
                  <p className="text-sm">처리 시각 · {completedIds.includes(selected.id) ? '2026.08.22 10:25:11' : selected.undoneAt}</p>
                  <p className="mt-1 text-sm">관리자 · 김서연</p>
                  <p className="mt-1 text-sm">사유 · {completedIds.includes(selected.id) ? reason : selected.undoReason}</p>
                  <p className="mt-2 text-xs text-muted-foreground">계보 연결만 정정했으며 원본과 기존 감사 행은 보존되었습니다. 별도 병합 되돌림 감사 사건이 생성되었습니다.</p>
                </Panel>
              )}

              {selectedStatus === '되돌림불가' && (
                <Panel title={<span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4" />되돌림불가</span>}>
                  <p className="text-sm font-medium">{selected.lockReason}</p>
                  <p className="mt-1 text-xs text-muted-foreground">새 기록을 덮어쓰거나 삭제하는 강제 우회는 제공하지 않습니다. 영향받은 환자 상세를 검토하고 감사 메모를 남기세요.</p>
                  <button className={`${btnGhost} mt-3`} onClick={() => navigate(`/staff/patients/${selected.merged.id}`)}>대상 환자 상세 <ExternalLink className="h-4 w-4" /></button>
                </Panel>
              )}
            </div>

            <aside className="space-y-4">
              <Panel title="감사 경계"><p className="text-xs leading-5 text-muted-foreground">병합 이벤트와 되돌림 이벤트는 환자정보 열람 기록과 섞이지 않습니다. 실행 관리자·시각·대표·대상·사유·결과를 별도 사건으로 남깁니다.</p></Panel>
              {selectedStatus === '되돌림불가' && <Panel title="감사 메모"><textarea value={auditMemo} maxLength={200} onChange={(event) => setAuditMemo(event.target.value)} placeholder="잠김 상태에서 확인한 내용을 기록하세요" className="min-h-24 w-full resize-none rounded-lg border border-input bg-card p-3 text-sm" /><button className={`${btnGhost} mt-2 w-full justify-center`} disabled={!auditMemo.trim()} onClick={() => setMemoSaved(true)}>{memoSaved ? '감사 메모 저장됨' : '감사 메모 남기기'}</button>{memoSaved && <p className="mt-2 text-xs text-muted-foreground">운영 참고 메모이며 되돌림 성공으로 표시되지 않습니다.</p>}</Panel>}
              <Panel title="이벤트 정보"><dl className="space-y-2 text-xs"><div className="flex justify-between"><dt className="text-muted-foreground">이벤트</dt><dd className="font-medium">{selected.id.toUpperCase()}</dd></div><div className="flex justify-between"><dt className="text-muted-foreground">병합 관리자</dt><dd className="font-medium">{selected.staff}</dd></div><div className="flex justify-between"><dt className="text-muted-foreground">현재 상태</dt><dd><Tag>{selectedStatus}</Tag></dd></div></dl></Panel>
            </aside>
          </div>
        </>
      )}

      {confirmOpen && selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-4" role="dialog" aria-modal="true" aria-label="병합 되돌림 확인">
          <Panel className="w-full max-w-xl" pad="p-0">
            <div className="flex items-start justify-between border-b border-border px-4 py-3"><div><h3 className="font-semibold">병합 되돌림 확인</h3><p className="mt-0.5 text-xs text-muted-foreground">별도 감사 사건이 남는 관리자 작업입니다</p></div><button className={btnGhost} aria-label="닫기" onClick={() => setConfirmOpen(false)}><X className="h-4 w-4" /></button></div>
            <div className="space-y-4 p-4 text-sm"><div className="grid grid-cols-2 gap-3"><div className="rounded-lg bg-primary/10 p-3"><PatientLabel label="대표 환자" patient={selected.representative} /></div><div className="rounded-lg bg-muted p-3"><PatientLabel label="분리할 대상" patient={selected.merged} /></div></div><div><div className="text-xs text-muted-foreground">되돌림 사유</div><p className="mt-1 rounded-lg bg-muted p-3 font-medium">{reason}</p></div><ul className="space-y-1 text-muted-foreground"><li>· 원본 행과 기존 감사 기록은 지우지 않습니다.</li><li>· 이미 열람된 기록은 되돌릴 수 없습니다.</li><li>· 최신 되돌림 가능 상태와 관리자 권한을 다시 검사합니다.</li></ul><label className="flex cursor-pointer items-start gap-2 rounded-lg border border-border p-3"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} className="mt-0.5 h-4 w-4 accent-primary" /><span>보존 범위·열람 제한·감사 사건 잔존을 읽었습니다</span></label></div>
            <div className="flex justify-end gap-2 border-t border-border px-4 py-3"><button className={btnGhost} onClick={() => setConfirmOpen(false)}>취소</button>{acknowledged && <button className={btnPrimary} onClick={completeUndo}><History className="h-4 w-4" />되돌림 확정</button>}</div>
          </Panel>
        </div>
      )}
    </StaffPage>
  )
}
