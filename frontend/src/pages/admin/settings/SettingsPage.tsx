import { useEffect, useState, type CSSProperties } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ApiError } from '../../../api/httpClient'
import { InlineError } from '../../../components/InlineError'
import {
  getSettings, previewCancellation, saveSettings,
  NOTIFICATION_ORDER, type NotificationType, type Settings, type SettingsPatch,
} from '../../../api/settings'
import { BookingRules } from './BookingRules'
import { WaitingRoom } from './WaitingRoom'
import { SmsSettings } from './SmsSettings'
import { HospitalInfo } from './HospitalInfo'
import { NotificationSettings } from './NotificationSettings'
import { SaveConfirmDialog } from './SaveConfirmDialog'

// [Task 29][HSET-*][HSETX-*] /admin/settings — 한 화면·한 저장(HSET-SAVE-01).
// 왼쪽 세로 메뉴 다섯을 오가며 고치고 맨 위 [저장] 하나로 전부가 원자적으로 들어간다. 화면은 저장만 한다.
// RequireRole이 route에서 관리자만 통과시키지만(App.tsx), 화면도 스스로 한 번 더 막는다(HSET-NAV-05·MSG-33).

type MenuKey = '예약 규칙' | '대기실 운영' | '문자 발송' | '자동 알림' | '병원 정보'

const MENUS: { key: MenuKey; fields: (keyof Settings)[] }[] = [
  { key: '예약 규칙', fields: ['cancellation_deadline_hours', 'auto_confirm_app_bookings'] },
  { key: '대기실 운영', fields: ['long_wait_threshold_minutes'] },
  { key: '문자 발송', fields: ['sms_enabled', 'sms_recipients', 'sms_opt_out_number'] },
  { key: '자동 알림', fields: ['notifications'] },
  { key: '병원 정보', fields: ['hospital_address', 'hospital_phone'] },
]

const SCALAR_KEYS: (keyof Settings)[] = [
  'cancellation_deadline_hours', 'long_wait_threshold_minutes', 'auto_confirm_app_bookings',
  'hospital_address', 'hospital_phone', 'sms_enabled', 'sms_recipients', 'sms_opt_out_number',
]

const TOKEN_MAP: Record<string, string> = { '환자 이름': '{이름}', '날짜': '{날짜}', '시각': '{시각}' }

function computePatch(base: Settings, draft: Settings): SettingsPatch {
  const patch: SettingsPatch = {}
  for (const k of SCALAR_KEYS) {
    if (draft[k] !== base[k]) (patch as Record<string, unknown>)[k] = draft[k]
  }
  const notif: SettingsPatch['notifications'] = {}
  for (const t of NOTIFICATION_ORDER) {
    const d = draft.notifications[t]
    const s = base.notifications[t]
    const np: { body_override?: string | null; send_sms?: boolean } = {}
    if (d.send_sms !== s.send_sms) np.send_sms = d.send_sms
    if (d.is_default && !s.is_default) np.body_override = null
    else if (!d.is_default && d.body !== s.body) np.body_override = d.body
    if (Object.keys(np).length) notif![t] = np
  }
  if (Object.keys(notif!).length) patch.notifications = notif
  return patch
}

function changedCount(patch: SettingsPatch): number {
  const scalar = Object.keys(patch).filter((k) => k !== 'notifications').length
  const notif = patch.notifications ? Object.keys(patch.notifications).length : 0
  return scalar + notif
}

function changedBodies(base: Settings, draft: Settings): string[] {
  return NOTIFICATION_ORDER
    .filter((t) => !draft.notifications[t].is_default && draft.notifications[t].body !== base.notifications[t].body)
    .map((t) => draft.notifications[t].body)
}

function validate(draft: Settings): string | null {
  const h = draft.cancellation_deadline_hours
  if (!(Number.isInteger(h) && h >= 0 && h <= 168)) return '취소 마감은 0~168시간으로 입력해 주세요.'
  const w = draft.long_wait_threshold_minutes
  if (!(Number.isInteger(w) && w >= 1 && w <= 180)) return '오래 대기 기준은 1~180분으로 입력해 주세요.'
  for (const t of NOTIFICATION_ORDER) {
    const row = draft.notifications[t]
    if (!row.is_default && !row.body.trim()) return '문구를 비워 둘 수 없습니다.'
  }
  return null
}

export function SettingsPage({ role = 'admin' }: { role?: string }) {
  const query = useQuery({ queryKey: ['admin-settings'], queryFn: getSettings, enabled: role === 'admin' })
  const [baseline, setBaseline] = useState<Settings | null>(null)
  const [draft, setDraft] = useState<Settings | null>(null)
  const [active, setActive] = useState<MenuKey>('예약 규칙')
  const [showLongWait, setShowLongWait] = useState(true)
  const [inlineError, setInlineError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [dialog, setDialog] = useState<{ count: number | null; bodies: string[]; patch: SettingsPatch } | null>(null)

  useEffect(() => {
    if (query.data && !baseline) {
      setBaseline(query.data)
      setDraft(query.data)
    }
  }, [query.data, baseline])

  if (role !== 'admin') return null
  if (query.isError) {
    return (
      <section>
        <p>설정을 불러오지 못했습니다.</p>
        <button type="button" onClick={() => query.refetch()}>다시 시도</button>
      </section>
    )
  }
  if (!draft || !baseline) return <p role="status">설정을 불러오는 중입니다</p>

  const patch = computePatch(baseline, draft)
  const dirtyCount = changedCount(patch)

  function change<K extends keyof Settings>(key: K, value: Settings[K]) {
    setDraft((d) => (d ? { ...d, [key]: value } : d))
    setSaveError(null)
  }
  function changeNotifBody(type: NotificationType, body: string) {
    setDraft((d) => d ? { ...d, notifications: { ...d.notifications, [type]: { ...d.notifications[type], body, is_default: false } } } : d)
  }
  function changeNotifSms(type: NotificationType, value: boolean) {
    setDraft((d) => d ? { ...d, notifications: { ...d.notifications, [type]: { ...d.notifications[type], send_sms: value } } } : d)
  }
  function revertNotif(type: NotificationType) {
    const original = baseline!.notifications[type]
    setDraft((d) => d ? { ...d, notifications: { ...d.notifications, [type]: { ...d.notifications[type], is_default: true, body: original.is_default ? original.body : d.notifications[type].body } } } : d)
  }
  function insertToken(type: NotificationType, token: string) {
    const piece = TOKEN_MAP[token] ?? token
    setDraft((d) => {
      if (!d) return d
      const cur = d.notifications[type].body
      const next = cur ? `${cur} ${piece}` : piece
      return { ...d, notifications: { ...d.notifications, [type]: { ...d.notifications[type], body: next, is_default: false } } }
    })
  }

  async function doSave(toSave: SettingsPatch) {
    try {
      await saveSettings(toSave, baseline!.version)
      const r = await query.refetch()
      if (r.data) {
        setBaseline(r.data)
        setDraft(r.data)
      }
      setSaveError(null)
    } catch (e) {
      // 409는 다른 관리자가 먼저 저장한 것 — 내 초안을 날리지 않고 안내만 한다(HSETX-STATE-03).
      setSaveError(e instanceof ApiError ? e.message : '저장하지 못했습니다. 다시 시도해 주세요.')
    }
  }

  async function onSave() {
    const err = validate(draft!)
    if (err) {
      setInlineError(err)
      return
    }
    setInlineError(null)
    const p = computePatch(baseline!, draft!)
    if (changedCount(p) === 0) return
    const cancellationChanged = 'cancellation_deadline_hours' in p
    const bodies = changedBodies(baseline!, draft!)
    if (cancellationChanged || bodies.length > 0) {
      let count: number | null = null
      if (cancellationChanged) count = (await previewCancellation(draft!.cancellation_deadline_hours)).count
      setDialog({ count, bodies, patch: p })
      return
    }
    await doSave(p)
  }

  function undo() {
    setDraft(baseline)
    setInlineError(null)
    setSaveError(null)
  }

  const menuDirty = (m: { fields: (keyof Settings)[] }) =>
    m.fields.some((f) => (f === 'notifications' ? !!patch.notifications : f in patch))

  // [HSET-NAV-03] 줄마다 지금 값을 한 줄로 — 안 열어 본 줄도 안이 짐작되고, 문자가 꺼진 채 운영하는 사고를 막는다.
  // (진료 일정 화면 SideRail과 같은 부제·같은 세로줄, HSET-NAV-06.) 값이 바뀌면 HSET-SAVE-03으로 주황이 된다.
  function subtitleFor(key: MenuKey): string {
    const h = draft!.cancellation_deadline_hours
    const w = draft!.long_wait_threshold_minutes
    switch (key) {
      case '예약 규칙':
        return `취소 마감 ${Number.isNaN(h) ? '—' : `${h}시간`} · 자동확정 ${draft!.auto_confirm_app_bookings ? '켜짐' : '꺼짐'}`
      case '대기실 운영':
        return showLongWait ? `${Number.isNaN(w) ? '—' : w}분 이상 표시` : '오래 대기 표시 꺼짐'
      case '문자 발송':
        return draft!.sms_enabled ? `켜짐 · ${draft!.sms_recipients === 'app_only' ? '앱 미설치자만' : '모든 환자'}` : '꺼짐'
      case '자동 알림':
        return `${NOTIFICATION_ORDER.length}종`
      case '병원 정보':
        return '환자 앱에 노출'
    }
  }

  return (
    <section style={styles.wrap}>
      <div style={styles.topbar}>
        <button type="button" onClick={onSave} style={styles.saveBtn}>저장</button>
        <button type="button" onClick={undo} style={styles.undoBtn}>되돌리기</button>
        {dirtyCount > 0 && <span style={styles.unsaved}>● 저장하지 않은 변경 {dirtyCount}곳</span>}
      </div>
      {inlineError && <InlineError message={inlineError} />}
      {saveError && <p role="alert" style={styles.saveError}>{saveError}</p>}

      <div style={styles.body}>
        <nav aria-label="설정 메뉴" style={styles.menu}>
          {MENUS.map((m) => {
            const isDirty = menuDirty(m)
            return (
              <button
                key={m.key}
                type="button"
                data-menu={m.key}
                aria-current={active === m.key ? 'true' : undefined}
                onClick={() => setActive(m.key)}
                style={{ ...styles.menuItem, ...(active === m.key ? styles.menuItemActive : {}) }}
              >
                <span style={styles.menuLabel}>
                  {m.key}
                  {isDirty && <span aria-hidden="true" style={styles.dot}> ●</span>}
                </span>
                <span
                  data-menu-sub
                  style={{ ...styles.menuSub, ...(isDirty ? styles.menuSubDirty : null) }}
                >
                  {subtitleFor(m.key)}
                </span>
              </button>
            )
          })}
        </nav>

        <div style={styles.panel}>
          {active === '예약 규칙' && <BookingRules draft={draft} onChange={change} />}
          {active === '대기실 운영' && (
            <WaitingRoom draft={draft} onChange={change} showLongWait={showLongWait} setShowLongWait={setShowLongWait} />
          )}
          {active === '문자 발송' && <SmsSettings draft={draft} onChange={change} />}
          {active === '자동 알림' && (
            <NotificationSettings
              draft={draft}
              smsEnabled={draft.sms_enabled}
              onBodyChange={changeNotifBody}
              onSmsChange={changeNotifSms}
              onRevert={revertNotif}
              onInsertToken={insertToken}
              onGoSms={() => setActive('문자 발송')}
            />
          )}
          {active === '병원 정보' && <HospitalInfo draft={draft} onChange={change} />}
        </div>
      </div>

      {dialog && (
        <SaveConfirmDialog
          cancellationCount={dialog.count}
          changedMessageBodies={dialog.bodies}
          onCancel={() => setDialog(null)}
          onConfirm={async () => {
            const p = dialog.patch
            setDialog(null)
            await doSave(p)
          }}
        />
      )}
    </section>
  )
}

const styles: Record<string, CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 12 },
  topbar: { display: 'flex', alignItems: 'center', gap: 12 },
  saveBtn: { height: 34, padding: '0 18px', borderRadius: 8, border: 'none', background: 'var(--color-primary)', color: '#fff', fontWeight: 700, cursor: 'pointer' },
  undoBtn: { height: 34, padding: '0 14px', borderRadius: 8, border: '1px solid var(--color-divider)', background: 'var(--color-surface)', color: 'var(--color-ink-muted)', fontWeight: 600, cursor: 'pointer' },
  unsaved: { fontSize: 'var(--fs-sm)', color: 'var(--color-warn)', fontWeight: 600 },
  saveError: { margin: 0, color: 'var(--color-warn)', fontWeight: 600 },
  body: { display: 'flex', gap: 20, alignItems: 'flex-start' },
  menu: { display: 'flex', flexDirection: 'column', gap: 2, width: 176, flex: '0 0 176px' },
  menuItem: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, width: '100%', textAlign: 'left', padding: '8px 12px', borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--color-ink)' },
  menuItemActive: { background: 'var(--color-primary-wash)', color: 'var(--color-primary)' },
  menuLabel: { fontSize: 'var(--fs-base)', fontWeight: 600 },
  menuSub: { fontSize: 'var(--fs-sm)', color: 'var(--color-ink-muted)' },
  menuSubDirty: { color: 'var(--color-warn)', fontWeight: 600 },
  dot: { color: 'var(--color-warn)' },
  panel: { flex: 1, minWidth: 0, background: 'var(--color-surface)', border: '1px solid var(--color-divider)', borderRadius: 'var(--radius-card, 8px)', padding: 20 },
}
