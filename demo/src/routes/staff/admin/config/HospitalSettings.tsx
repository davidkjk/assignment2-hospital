import { useRef, useState } from 'react'
import { AlertTriangle } from '@/components/icons'
import { StaffPage, PageHead, btnPrimary } from '../../_ui'
import { initialSettings, notificationRows, type HospitalSettings as Settings, type NotificationRow } from './mockData'

// 알림 문구에 꽂을 수 있는 값 셋 (HSET-MSG-16: 환자 이름·날짜·시각, 눌러서 꽂는다·직접 타이핑 금지)
const TOKENS = ['[환자 이름]', '[날짜]', '[시각]'] as const
/** 저장 전 미리보기용 — 넣은 값이 실제 글자로 바뀐 모양을 보여준다 (HSET-MSG-13) */
function fillTokens(t: string): string {
  return t.replaceAll('[환자 이름]', '김가온').replaceAll('[날짜]', '8월 12일').replaceAll('[시각]', '오후 2:00')
}

// 병원 설정 (/staff/admin/settings) — HSET-*.
// 왼쪽 세로줄 5: 예약 규칙·대기실 운영·문자 발송·알림·병원 정보. 줄마다 지금 값 부제(HSET-NAV-03).
// [저장]은 변경 있을 때만. 끄는 스위치는 값을 보존하고 관련 칸만 잠근다. data-testid="staff-hospital-settings".

type Tab = 'booking' | 'waiting' | 'sms' | 'notify' | 'info'

export function HospitalSettings() {
  const [tab, setTab] = useState<Tab>('booking')
  const [s, setS] = useState<Settings>(initialSettings)
  const [notify, setNotify] = useState<NotificationRow[]>(notificationRows)
  const [saved, setSaved] = useState<Settings>(initialSettings)
  const [savedNotify, setSavedNotify] = useState<NotificationRow[]>(notificationRows)

  const notifyDirty = JSON.stringify(notify) !== JSON.stringify(savedNotify)
  const dirty = JSON.stringify(s) !== JSON.stringify(saved) || notifyDirty
  const set = (up: Partial<Settings>) => setS((prev) => ({ ...prev, ...up }))

  // 문구 칸에 값을 꽂기 위해 마지막으로 만진 칸을 기억한다
  const [notifyFocus, setNotifyFocus] = useState<number | null>(null)
  const activeInput = useRef<HTMLInputElement | null>(null)
  const [confirmSave, setConfirmSave] = useState(false)

  const doSave = () => {
    setSaved(s)
    setSavedNotify(notify)
    setConfirmSave(false)
  }
  // 문구를 고쳤으면 저장 전에 한 번 되묻는다 (HSET-MSG-12), 아니면 바로 저장
  const onSave = () => (notifyDirty ? setConfirmSave(true) : doSave())

  const insertToken = (token: string) => {
    if (notifyFocus == null) return
    const el = activeInput.current
    const cur = notify[notifyFocus].text
    const at = el?.selectionStart ?? cur.length
    const end = el?.selectionEnd ?? at
    const next = cur.slice(0, at) + token + cur.slice(end)
    setNotify((prev) => prev.map((x, j) => (j === notifyFocus ? { ...x, text: next } : x)))
  }

  const NAV: { key: Tab; label: string; sub: string }[] = [
    { key: 'booking', label: '예약 규칙', sub: `취소 마감 ${s.cancellationDeadlineHours}시간 · 자동확정 ${s.autoConfirm ? '켜짐' : '꺼짐'}` },
    { key: 'waiting', label: '대기실 운영', sub: s.longWaitEnabled ? `${s.longWaitMin}분 이상 표시` : '오래 대기 표시 꺼짐' },
    { key: 'sms', label: '문자 발송', sub: s.smsEnabled ? `켜짐 · ${s.smsWho}` : '꺼짐' },
    { key: 'notify', label: '자동 알림', sub: `${notify.length}종` },
    { key: 'info', label: '병원 정보', sub: '환자 앱에 노출' },
  ]

  return (
    <StaffPage max="max-w-5xl" testid="staff-hospital-settings">
      <PageHead
        title="병원 설정"
        action={
          <button className={`${btnPrimary} disabled:opacity-50`} disabled={!dirty} onClick={onSave}>
            저장
          </button>
        }
      />

      <div className="flex gap-4">
        <nav className="w-48 shrink-0 space-y-1">
          {NAV.map((n) => (
            <button
              key={n.key}
              onClick={() => setTab(n.key)}
              className={`w-full rounded-lg px-3 py-2 text-left ${tab === n.key ? 'bg-primary/10 text-primary' : 'hover:bg-muted'}`}
            >
              <div className="text-sm font-medium">{n.label}</div>
              <div className="text-[11px] text-muted-foreground">{n.sub}</div>
            </button>
          ))}
        </nav>

        <div className="min-w-0 flex-1 rounded-xl border border-border/70 bg-card p-5 shadow-[0_1px_2px_rgba(16,45,50,0.04)]">
          {tab === 'booking' && (
            <div className="space-y-5">
              <Row label="취소 마감 시간" hint="이 시간이 지나면 앱에서 바로 취소할 수 없고 상담으로 연결됩니다.">
                <span className="inline-flex items-center gap-2">
                  <input type="number" value={s.cancellationDeadlineHours} onChange={(e) => set({ cancellationDeadlineHours: Number(e.target.value) })} className={numCls} />
                  <span className="text-sm text-muted-foreground">시간 전까지</span>
                </span>
              </Row>
              <Row label="앱 예약 자동확정" hint={s.autoConfirm ? '앱에서 예약하면 바로 확정됩니다.' : '꺼짐 — 직원이 확인한 뒤 확정됩니다.'}>
                <Toggle on={s.autoConfirm} onChange={(v) => set({ autoConfirm: v })} />
              </Row>
            </div>
          )}

          {tab === 'waiting' && (
            <div className="space-y-5">
              <Row label="오래 기다리는 환자 표시" hint="오래 기다린 환자를 「지금 처리할 것」에 카드로 띄웁니다. 환자에게 알림을 보내지는 않습니다.">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={s.longWaitEnabled} onChange={(e) => set({ longWaitEnabled: e.target.checked })} />
                  <input
                    type="number"
                    value={s.longWaitMin}
                    onChange={(e) => set({ longWaitMin: Number(e.target.value) })}
                    disabled={!s.longWaitEnabled}
                    className={`${numCls} disabled:opacity-40`}
                  />
                  <span className="text-sm text-muted-foreground">분 이상</span>
                </label>
              </Row>
            </div>
          )}

          {tab === 'sms' && (
            <div className="space-y-5">
              <Row label="문자 발송" hint="문자를 끄면 아래 「누구에게」와 자동 알림의 「문자도 발송」이 잠깁니다. 값은 보존됩니다.">
                <Toggle on={s.smsEnabled} onChange={(v) => set({ smsEnabled: v })} />
              </Row>
              <Row label="누구에게 문자를 보내나">
                <div className={`flex gap-1.5 ${s.smsEnabled ? '' : 'opacity-40'}`}>
                  {(['앱을 안 쓰는 환자만', '모든 환자'] as Settings['smsWho'][]).map((w) => (
                    <button
                      key={w}
                      disabled={!s.smsEnabled}
                      onClick={() => set({ smsWho: w })}
                      className={`rounded-lg border px-3 py-1.5 text-sm ${s.smsWho === w ? 'border-primary bg-primary/5 text-primary' : 'border-border text-muted-foreground'}`}
                    >
                      {w}
                    </button>
                  ))}
                </div>
              </Row>
              <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                보낼 때마다 병원이 비용을 냅니다. 발송업체 계정은 병원에서 따로 준비합니다.
              </p>
            </div>
          )}

          {tab === 'notify' && (
            <div>
              <p className="mb-3 text-xs text-muted-foreground">
                환자에게 자동으로 나가는 알림 문구입니다. 칸을 누르고 아래 <b className="text-foreground">이름·날짜·시각</b> 버튼으로 값을 꽂으세요.
              </p>
              {!s.smsEnabled && (
                <div className="mb-3 flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  문자가 꺼져 있어 「문자도 발송」 열이 잠겼습니다.
                  <button className="ml-auto font-medium text-primary hover:underline" onClick={() => setTab('sms')}>문자 발송 설정으로 ›</button>
                </div>
              )}
              <div className="overflow-hidden rounded-xl border border-border/70">
                <div className="grid grid-cols-[120px_1fr_88px] items-center gap-3 border-b border-border/70 bg-muted/40 px-3 py-2 text-sm font-medium text-muted-foreground">
                  <span>종류</span><span>문구</span><span className="text-center">문자도 발송</span>
                </div>
                {notify.map((n, i) => (
                  <div key={n.kind} className="grid grid-cols-[120px_1fr_88px] items-start gap-3 border-b border-border/60 px-3 py-2 last:border-b-0">
                    <span className="pt-1.5 text-sm font-medium">{n.kind}</span>
                    <div>
                      <input
                        value={n.text}
                        ref={(el) => { if (notifyFocus === i) activeInput.current = el }}
                        onFocus={(e) => { setNotifyFocus(i); activeInput.current = e.currentTarget }}
                        onChange={(e) => setNotify((prev) => prev.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
                        className="w-full rounded-lg border border-input bg-card px-2.5 py-1.5 text-sm outline-none focus:border-ring"
                      />
                      {/* 눌러서 꽂는 값 칩 — 지금 만지는 칸 아래에만 (HSET-MSG-16) */}
                      {notifyFocus === i && (
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {TOKENS.map((t) => (
                            <button
                              key={t}
                              onMouseDown={(e) => { e.preventDefault(); insertToken(t) }}
                              className="rounded-md border border-primary/40 bg-primary/5 px-2 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/10"
                            >
                              ＋ {t.replace(/[[\]]/g, '')}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex justify-center pt-1.5">
                      <input
                        type="checkbox"
                        checked={n.alsoSms}
                        disabled={!s.smsEnabled}
                        onChange={(e) => setNotify((prev) => prev.map((x, j) => (j === i ? { ...x, alsoSms: e.target.checked } : x)))}
                        className="disabled:opacity-40"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'info' && (
            <div className="space-y-5">
              <p className="rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-800">아래 정보는 환자 앱에 그대로 보입니다.</p>
              <Row label="주소"><input value={s.hospitalAddress} onChange={(e) => set({ hospitalAddress: e.target.value })} className={textCls} /></Row>
              <Row label="대표 전화"><input value={s.hospitalPhone} onChange={(e) => set({ hospitalPhone: e.target.value })} className={textCls} /></Row>
              <Row label="다가오는 휴무일" hint="휴무일 등록은 진료 일정 › 특정 날짜 변경에서 합니다.">
                <ul className="text-sm text-muted-foreground">
                  <li className="tabular-nums">· 9/5 (금) 오후 — 박강우 휴진</li>
                  <li className="tabular-nums">· 9/28 (월) — 추석 연휴 휴진</li>
                </ul>
              </Row>
            </div>
          )}
        </div>
      </div>

      {/* 저장 전 되묻기 + 미리보기 (HSET-MSG-12·13) */}
      {confirmSave && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-card p-6 shadow-[var(--elevation-card)]">
            <h2 className="text-lg font-bold">이대로 저장할까요?</h2>
            <p className="mt-1 text-sm text-muted-foreground">이 문장은 잠금화면에 그대로 뜨고, 문자로 보낸 경우 환자 폰에 남습니다.</p>
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              진료과 · 의사 이름 · 증상은 넣지 마세요.
            </div>
            <div className="mt-4 space-y-2">
              <div className="text-xs font-medium text-muted-foreground">보내질 모양 (값을 채운 미리보기)</div>
              {notify.map((n) => (
                <div key={n.kind} className="rounded-lg border border-border/70 bg-muted/30 px-3 py-2">
                  <div className="text-[11px] text-muted-foreground">{n.kind}{n.alsoSms ? ' · 문자도 발송' : ''}</div>
                  <div className="mt-0.5 text-sm">{fillTokens(n.text)}</div>
                </div>
              ))}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setConfirmSave(false)} className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted">더 고치기</button>
              <button onClick={doSave} className={btnPrimary}>이대로 저장</button>
            </div>
          </div>
        </div>
      )}
    </StaffPage>
  )
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
      <div className="sm:max-w-xs">
        <div className="text-sm font-medium">{label}</div>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!on)} className={`relative h-6 w-11 rounded-full transition-colors ${on ? 'bg-primary' : 'bg-muted'}`} aria-label="스위치">
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  )
}

const numCls = 'w-16 rounded-lg border border-input bg-card px-2 py-1.5 text-center text-sm outline-none focus:border-ring'
const textCls = 'w-72 max-w-full rounded-lg border border-input bg-card px-3 py-1.5 text-sm outline-none focus:border-ring'
