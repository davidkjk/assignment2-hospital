// data-testid: staff-merge-candidates
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { ArrowLeft, CheckCircle2, ExternalLink, Layers3, LockKeyhole, ShieldCheck, X } from '@/components/icons'

import { maskBirth, maskPhone } from '../../mockData'
import { PageHead, Panel, StaffPage, StatusBadge, Tag, btnGhost, btnLink, btnPrimary } from '../../_ui'
import { mergeCandidates, type MergeCandidateGroup, type MergePatient } from './mockData'

function CandidateSummary({ patient }: { patient: MergePatient }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2"><span className="font-semibold">{patient.name}</span><Tag>{patient.displayId}</Tag>{patient.accountLinked && <StatusBadge status="계정 연결" tone="teal" />}</div>
      <p className="mt-1 text-xs text-muted-foreground">{maskBirth(patient.birth)} · {maskPhone(patient.phone)}</p>
      <p className="mt-1 text-xs text-muted-foreground">예약 {patient.appointments}건 · 진료기록 {patient.medicalRecords}건 · 마지막 방문 {patient.lastVisit}</p>
    </div>
  )
}

function CompareCard({
  patient,
  selected,
  recommended,
  onSelect,
  onOpenPatient,
}: {
  patient: MergePatient
  selected: boolean
  recommended: boolean
  onSelect: () => void
  onOpenPatient: () => void
}) {
  const rows = [
    ['계정 연결', patient.accountLinked ? '연결됨' : '연결 없음'],
    ['예약', `${patient.appointments}건`],
    ['문진 작성 예약', `${patient.questionnaires}건`],
    ['진료기록', `${patient.medicalRecords}건`],
    ['감사 기록', `${patient.auditRecords}건`],
    ['마지막 방문일', patient.lastVisit],
  ]

  return (
    <Panel className={selected ? 'border-primary' : ''} pad="p-0">
      <div className="border-b border-border p-4">
        <div className="flex items-start justify-between gap-3">
          <CandidateSummary patient={patient} />
          {selected ? <StatusBadge status="대표 환자" tone="teal" /> : <Tag>병합 대상 후보</Tag>}
        </div>
        {recommended && <p className="mt-2 text-xs font-medium text-primary">기록이 더 많은 쪽을 대표로 권합니다</p>}
      </div>
      <dl className="divide-y divide-border/60 px-4">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-3 py-2.5 text-sm"><dt className="text-muted-foreground">{label}</dt><dd className="font-medium tabular-nums">{value}</dd></div>
        ))}
      </dl>
      <div className="flex items-center justify-between gap-3 border-t border-border p-3">
        <button className={btnLink} onClick={onOpenPatient}>환자 상세에서 원문 확인 <ExternalLink className="ml-1 inline h-3 w-3" /></button>
        <button className={selected ? btnPrimary : btnGhost} onClick={onSelect}>{selected ? <CheckCircle2 className="h-4 w-4" /> : null}{selected ? '대표로 선택됨' : '대표로 검토'}</button>
      </div>
    </Panel>
  )
}

export function MergeCandidates() {
  const navigate = useNavigate()
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [representativeId, setRepresentativeId] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [acknowledged, setAcknowledged] = useState(false)
  const [completedGroupId, setCompletedGroupId] = useState<string | null>(null)

  const selectedGroup = mergeCandidates.find((group) => group.id === selectedGroupId) ?? null
  const representative = selectedGroup?.patients.find((patient) => patient.id === representativeId) ?? null
  const mergedPatient = selectedGroup?.patients.find((patient) => patient.id !== representativeId) ?? null

  const openGroup = (group: MergeCandidateGroup) => {
    setSelectedGroupId(group.id)
    setRepresentativeId(null)
    setConfirmOpen(false)
    setAcknowledged(false)
  }

  const completeMerge = () => {
    if (!selectedGroup || !acknowledged || !representative) return
    setCompletedGroupId(selectedGroup.id)
    setConfirmOpen(false)
    setAcknowledged(false)
  }

  return (
    <StaffPage testid="staff-merge-candidates">
      <PageHead title="중복 환자 후보" sub="같은 사람의 환자 기록이 나뉘었는지 확인하고 병합을 검토합니다" />

      <Panel className="mb-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div><p className="text-sm font-semibold">자동으로 합치지 않습니다</p><p className="mt-0.5 text-xs text-muted-foreground">두 기록을 직접 비교하고 대표를 정한 뒤에만 검토를 시작합니다. 가족이 같은 전화번호를 사용할 수 있으므로 같은 값만으로 동일인이라 단정하지 마세요.</p></div>
        </div>
      </Panel>

      <div className="mb-4 grid grid-cols-3 gap-2 text-xs">
        {['1. 후보 선택', '2. 대표 검토', '3. 확인 후 확정'].map((step, index) => {
          const active = selectedGroup ? (confirmOpen ? index <= 2 : index <= 1) : index === 0
          return <div key={step} className={`rounded-lg border px-3 py-2 font-medium ${active ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground'}`}>{step}</div>
        })}
      </div>

      {completedGroupId && (
        <Panel className="mb-4" title={<span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary" />병합이 완료되었습니다</span>}>
          <p className="text-sm text-muted-foreground">병합 이력 ID {completedGroupId.toUpperCase()}가 생성되었습니다. 원본 기록은 각 환자 ID에 보존되며 병합과 별도의 감사 사건이 남았습니다.</p>
        </Panel>
      )}

      {!selectedGroup ? (
        <div className="space-y-3">
          {mergeCandidates.filter((group) => group.id !== completedGroupId).map((group) => (
            <Panel key={group.id} pad="p-0">
              <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                <div><div className="flex items-center gap-2"><Layers3 className="h-4 w-4 text-primary" /><h3 className="text-sm font-semibold">{group.patients[0].name} 중복 후보</h3><Tag>{group.id.toUpperCase()}</Tag></div><p className="mt-1 text-xs text-muted-foreground">{group.reason}</p></div>
                <button className={btnGhost} onClick={() => openGroup(group)}>두 후보 비교</button>
              </div>
              <div className="grid divide-y divide-border/60 md:grid-cols-2 md:divide-x md:divide-y-0">
                {group.patients.map((patient) => <div key={patient.id} className="p-4"><CandidateSummary patient={patient} /></div>)}
              </div>
              <p className="border-t border-border px-4 py-2.5 text-xs text-muted-foreground">같은 값으로 묶인 후보입니다. 가족이 번호를 공유하면 실제로 다른 사람일 수 있습니다.</p>
            </Panel>
          ))}
        </div>
      ) : (
        <>
          <button className={`${btnGhost} mb-3`} onClick={() => { setSelectedGroupId(null); setRepresentativeId(null) }}><ArrowLeft className="h-4 w-4" />후보 목록</button>
          <div className="mb-3 flex items-center justify-between gap-3"><div><h3 className="text-sm font-semibold">두 후보 비교</h3><p className="text-xs text-muted-foreground">대표로 유지할 환자를 직접 선택하세요. 선택만으로 데이터는 바뀌지 않습니다.</p></div><Tag>{selectedGroup.id.toUpperCase()}</Tag></div>
          <div className="grid gap-4 lg:grid-cols-2">
            {selectedGroup.patients.map((patient) => (
              <CompareCard
                key={patient.id}
                patient={patient}
                selected={patient.id === representativeId}
                recommended={patient.medicalRecords === Math.max(...selectedGroup.patients.map((item) => item.medicalRecords))}
                onSelect={() => setRepresentativeId(patient.id)}
                onOpenPatient={() => navigate(`/staff/patients/${patient.id}`)}
              />
            ))}
          </div>
          <Panel className="mt-4" title="기록 보존 방식">
            <p className="text-sm text-muted-foreground">원본 예약·문진·진료기록·열람 기록은 원래 자리에 남고, 대표 조회가 계보를 따라 두 ID를 함께 읽습니다. 물리적으로 덮어쓰거나 삭제하지 않습니다.</p>
            {representativeId && representativeId !== selectedGroup.patients[0].id && <p className="mt-2 text-xs font-medium text-primary">기록이 적은 쪽을 대표로 선택했습니다. 계정 연결과 이력에서 보이는 범위를 확인하세요.</p>}
            <div className="mt-3 flex justify-end"><button className={btnGhost} disabled={!representativeId} onClick={() => setConfirmOpen(true)}><LockKeyhole className="h-4 w-4" />병합 내용 검토</button></div>
          </Panel>
        </>
      )}

      {confirmOpen && selectedGroup && representative && mergedPatient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-4" role="dialog" aria-modal="true" aria-label="환자 병합 확인">
          <Panel className="w-full max-w-xl" pad="p-0">
            <div className="flex items-start justify-between border-b border-border px-4 py-3"><div><h3 className="font-semibold">환자 병합 확인</h3><p className="mt-0.5 text-xs text-muted-foreground">확정 전 대표·대상과 보존 범위를 다시 확인하세요</p></div><button className={btnGhost} aria-label="닫기" onClick={() => setConfirmOpen(false)}><X className="h-4 w-4" /></button></div>
            <div className="space-y-4 p-4 text-sm">
              <div className="grid grid-cols-2 gap-3"><div className="rounded-lg bg-primary/10 p-3"><div className="text-xs text-muted-foreground">대표 환자</div><div className="mt-1 font-semibold">{representative.name} · {representative.displayId}</div></div><div className="rounded-lg bg-muted p-3"><div className="text-xs text-muted-foreground">비활성화될 대상</div><div className="mt-1 font-semibold">{mergedPatient.name} · {mergedPatient.displayId}</div></div></div>
              <ul className="space-y-2 text-muted-foreground"><li>· 원본 예약·문진·진료·감사 기록은 원래 ID에 보존됩니다.</li><li>· 병합 확정 후 이 화면에서 취소할 수 없습니다.</li><li>· 오병합 정정은 병합 이력에서 관리자 사유와 별도 확인을 거칩니다.</li><li>· 이미 열람된 기록은 되돌릴 수 없습니다.</li></ul>
              <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-border p-3"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} className="mt-0.5 h-4 w-4 accent-primary" /><span><span className="font-medium">대표·대상, 데이터 보존 방식과 오병합 정정 절차를 읽었습니다</span><span className="mt-0.5 block text-xs text-muted-foreground">이 확인은 서버 권한·최신 상태 검사를 대신하지 않습니다.</span></span></label>
            </div>
            <div className="flex justify-end gap-2 border-t border-border px-4 py-3"><button className={btnGhost} onClick={() => setConfirmOpen(false)}>취소</button>{acknowledged && <button className={btnPrimary} onClick={completeMerge}>병합 확정</button>}</div>
          </Panel>
        </div>
      )}
    </StaffPage>
  )
}
