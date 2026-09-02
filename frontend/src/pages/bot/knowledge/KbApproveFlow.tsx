import { useState } from 'react'
import { History, ShieldCheck, AlertTriangle } from '../../../components/icons'
import { btnPrimary, btnGhost } from '../../../components/staff-ui'
import type { KbAdminApi } from '../../../api/kbAdmin'

// 승인 흐름(KBADM-EDITOR-09~14) — 되돌릴 수 없는 동작이라 확인창 안에서만 실행하고, 재임베딩 성공 전에는
// 기존 승인본을 유지한다. 실패는 성공으로 추측하지 않고 부분 반영 여부를 '확인 필요'로 남긴다.
// 승인 완료엔 승인 취소 버튼을 두지 않는다 — 정정은 수정이력의 이전 버전 편집→재승인(A2).

type Stage = 'idle' | 'confirming' | 'approving' | 'done' | 'failed'

export interface KbApproveFlowProps {
  api: KbAdminApi
  docId: string
  onGotoRevision: (docId: string) => void
  /** 라이브(현재 승인본) 제목 — 승인 성공 전까지 그대로 유지됨을 보인다(EDITOR-10). */
  liveTitle?: string
  /** 이미 승인 완료 상태로 진입(승인 후 정정 경로 진입점, EDITOR-14). */
  approved?: boolean
  /** 재승인 불가(의사 소개·진료시간 자료 등, EDITOR-17). */
  disabled?: boolean
}

export function KbApproveFlow({ api, docId, onGotoRevision, liveTitle, approved = false, disabled = false }: KbApproveFlowProps) {
  const [stage, setStage] = useState<Stage>(approved ? 'done' : 'idle')

  const runApprove = () => {
    setStage('approving') // 완료 전에는 성공/자동 종료하지 않는다(EDITOR-11)
    api
      .approveDoc(docId)
      .then(() => setStage('done'))
      .catch(() => setStage('failed')) // 성공으로 추측하지 않는다(EDITOR-12)
  }

  return (
    <div className="space-y-2">
      {liveTitle && stage !== 'done' && (
        <p className="text-xs text-muted-foreground">
          현재 답변에 쓰이는 자료: <b className="text-foreground">{liveTitle}</b> (승인 전까지 그대로 유지됩니다)
        </p>
      )}

      {stage === 'done' && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          <ShieldCheck className="h-4 w-4 text-emerald-600" /> 승인되어 AI 상담봇 답변에 반영되었습니다
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        {/* 수정이력은 승인 후에도 남는다 — 정정=이전 버전 편집→재승인(A2)의 진입점(EDITOR-14) */}
        <button className={`${btnGhost} px-2.5 py-1.5`} onClick={() => onGotoRevision(docId)}>
          <History className="h-3.5 w-3.5" /> 수정이력 보기
        </button>
        {stage !== 'done' && (
          <button className={btnPrimary} disabled={disabled} onClick={() => setStage('confirming')}>
            승인
          </button>
        )}
      </div>

      {stage === 'failed' && (
        <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
          <span>
            승인에 실패했습니다. 이번 승인이 일부만 반영됐는지는 확인이 필요합니다 — 다시 시도하거나 잠시 후 상태를 확인하세요.
          </span>
        </div>
      )}

      {(stage === 'confirming' || stage === 'approving') && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-xl">
            <h3 className="text-base font-bold">승인해 반영할까요?</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              승인하면 재임베딩을 거쳐 AI 상담봇 답변에 반영되고, 승인은 되돌릴 수 없습니다. 잘못 넣었다면 수정이력에서 이전 버전을
              편집해 다시 승인하세요.
            </p>
            {stage === 'approving' && <p className="mt-3 text-sm font-medium text-primary">승인하여 반영 중</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button className={btnGhost} disabled={stage === 'approving'} onClick={() => setStage('idle')}>
                취소
              </button>
              <button className={btnPrimary} disabled={stage === 'approving'} onClick={runApprove}>
                승인하여 반영
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
