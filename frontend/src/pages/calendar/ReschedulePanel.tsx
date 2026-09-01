import { useState } from 'react'
import { BusyButton } from '../../components/BusyButton'

// [CAL-PANEL-02][CAL-RACE-03][schedule-change] 예약 변경(reschedule) — 같은 의사·같은 환자를 그대로 두고
//   시각만 옮긴다(백엔드 reschedule_appointment는 doctor를 유지하고 사유를 요구한다).
//   ⭐ 새 시각은 왼쪽 캘린더(격자를 좁힌 채)에서 빈칸을 눌러 고른다(CAL-PANEL-02) — 이 패널은 고른 시각을
//      받아 보여 주고 사유를 받는다. 저장이 충돌(409)하면 환자·의사·사유는 지키고 시각만 비운다(CAL-RACE-03·04).
//   ⛔ 되돌릴 수 없는 취소와 달리 변경은 자리를 옮기는 일이라 빨간 버튼이 아니다.

interface ReschedulePanelProps {
  patientLabel: string
  doctorLabel: string
  /** 왼쪽 캘린더에서 고른 새 시각의 라벨('YYYY-MM-DD HH:MM'). 아직 안 골랐으면 null. */
  chosenTimeLabel: string | null
  /** 저장 — 사유와 함께. 실패는 밖에서 actionError로 돌려준다(막다른 길 대신 이유, G1). */
  onSubmit: (reason: string) => void | Promise<void>
  onCancel: () => void
  /** 저장 실패 문구(409 충돌 등) — 인라인으로 알린다. */
  actionError?: string | null
  /** 저장 진행 중(컨트롤드). */
  busy?: boolean
}

export function ReschedulePanel({
  patientLabel,
  doctorLabel,
  chosenTimeLabel,
  onSubmit,
  onCancel,
  actionError,
  busy,
}: ReschedulePanelProps) {
  // ⚠️ 사유는 이 패널 안에서 관리한다 — 왼쪽에서 새 시각을 다시 골라 이 패널이 다시 그려져도
  //    (CalendarPage가 openPanel을 다시 부른다) 컴포넌트 자리가 같아 React가 갈아끼우기만 하므로 사유가 산다.
  const [reason, setReason] = useState('')
  const canSave = !!chosenTimeLabel && reason.trim().length > 0

  return (
    <div className="cal-appointment-panel">
      <div className="cal-panel-subject">
        <h2 className="cal-panel-subject-name">{patientLabel}</h2>
        <span className="cal-status-badge">변경 중</span>
      </div>

      <dl className="cal-panel-fields">
        <div>
          <dt>의사</dt>
          <dd>{doctorLabel}</dd>
        </div>
        <div>
          <dt>새 시각</dt>
          <dd>
            {chosenTimeLabel ?? (
              <span className="cal-support-line">왼쪽 캘린더에서 새 시각을 고르세요</span>
            )}
          </dd>
        </div>
      </dl>

      <label className="cal-field">
        <span className="cal-field-label">변경 사유</span>
        <textarea
          aria-label="변경 사유"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
        />
      </label>

      <div className="cal-panel-actions">
        <BusyButton
          label="예약 변경 저장"
          busyLabel="저장하는 중…"
          busy={busy}
          disabled={!canSave}
          onClick={() => onSubmit(reason.trim())}
        />
        <button type="button" className="cal-cancel-link" onClick={onCancel}>
          그만두기
        </button>
      </div>

      {actionError && (
        <p className="cal-support-line is-error" role="alert">
          {actionError}
        </p>
      )}
    </div>
  )
}
