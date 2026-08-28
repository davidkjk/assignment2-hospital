import { useState, type CSSProperties } from 'react'
import type { StaffProfile } from '../auth/roles'
import { AccountMenu } from './AccountMenu'
import { HOSPITAL_NAME } from './brand'
import { START_DOORS, type StartDoor } from './navItems'

export type { StartDoor } from './navItems'

const doorBase = 'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium shadow-sm'
// 가운데 = 접수(창구에서 가장 자주 하는 일)만 딥틸로 도드라지게, 양쪽(등록·예약)은 옅은 흰 버튼.
const doorGhost = `${doorBase} bg-card text-primary hover:bg-muted`
const doorPrimary = `${doorBase} bg-primary text-primary-foreground hover:bg-primary/90`

export function Header({ staff, onSignOut, onStart = () => undefined }: { staff: StaffProfile; onSignOut: () => void | Promise<void>; onStart?: (door: StartDoor) => void }) {
  const [confirming, setConfirming] = useState(false)
  const [message, setMessage] = useState('')
  const doors = START_DOORS.filter((door) => door.roles.includes(staff.role))
  return (
    <>
      {/* 헤더 하단은 실선(border-b), 그림자 아님 — 업무 도구 밀도(SHELL-HDR). 병원명은 왼쪽 상시. */}
      <header className="relative z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card px-6">
        <span aria-label="병원 이름" className="shrink-0 whitespace-nowrap font-semibold">{HOSPITAL_NAME}</span>

        <div className="ml-auto flex items-center gap-3">
          {/* 역할칩은 항상 표시(SHELL-HDR-02) */}
          <AccountMenu staff={staff} onPasswordChanged={() => setMessage('비밀번호를 바꿨습니다')} />
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            로그아웃
          </button>

          {/* 세 문 — 등록 / 접수 / 예약(F-4). 로그아웃과 넓은 여백+구분선으로 가른다(SHELL-HDR-05).
              의사는 예약을 잡지 않으므로 아예 안 그린다(SHELL-ACT-03). */}
          {doors.length > 0 && (
            <div data-testid="start-door-group" aria-label="시작 업무" style={doorGroupStyle}>
              {doors.map((door) => (
                <button
                  type="button"
                  key={door.key}
                  data-testid="start-door"
                  onClick={() => onStart(door.key)}
                  className={door.primary ? doorPrimary : doorGhost}
                >
                  {door.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      {message && (
        <div role="status" className="fixed bottom-6 right-6 z-40 rounded-lg bg-foreground px-3 py-3 text-sm text-white shadow-[var(--shadow-card)]">
          {message}
        </div>
      )}

      {confirming && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/20 px-4">
          <div role="dialog" aria-labelledby="logout-title" aria-modal="true" className="w-full max-w-sm rounded-2xl bg-card p-6 shadow-[var(--shadow-card)]">
            <h2 id="logout-title" className="mb-5 text-lg font-bold">로그아웃할까요?</h2>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                autoFocus
                onClick={() => setConfirming(false)}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => { setConfirming(false); void onSignOut() }}
                className="rounded-lg bg-card px-4 py-2 text-sm font-medium text-muted-foreground shadow-sm hover:bg-muted"
              >
                로그아웃
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// 로그아웃과 세 문 사이 넓은 구분 여백+실선(SHELL-HDR-05). 테스트가 margin/padding 값을 확인하므로 인라인 유지.
const doorGroupStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, marginLeft: 16, paddingLeft: 24, borderLeft: '1px solid var(--color-divider)' }
