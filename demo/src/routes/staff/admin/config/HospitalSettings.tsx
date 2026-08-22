import { useState, type ReactNode } from 'react'
import { AlertTriangle, Bell, CheckCircle2, Hospital, MessageCircle, Settings2, X } from '@/components/icons'
import { PageHead, Panel, StaffPage, Tag, btnGhost, btnLink, btnPrimary } from '../../_ui'
import { notificationRows } from './mockData'

// 병원 설정 (/admin/settings) — HSET-* · data-testid="staff-hospital-settings".
type SettingsSection = 'booking' | 'waiting' | 'sms' | 'info' | 'notifications'

const sections: { key: SettingsSection; label: string; sub: string }[] = [
  { key: 'booking', label: '예약 규칙', sub: '취소 마감 24시간 · 자동확정 켜짐' },
  { key: 'waiting', label: '대기실 운영', sub: '오래 대기 30분부터 표시' },
  { key: 'sms', label: '문자 발송', sub: '켜짐 · 앱 미사용 환자만' },
  { key: 'info', label: '병원 정보', sub: '주소 · 대표 전화' },
  { key: 'notifications', label: '알림', sub: '문구 5종 · 문자로도 3종' },
]

export function HospitalSettings() {
  const [section, setSection] = useState<SettingsSection>('booking')
  const [dirty, setDirty] = useState(false)
  const [saved, setSaved] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [cancelHours, setCancelHours] = useState(24)
  const [autoConfirm, setAutoConfirm] = useState(true)
  const [longWaitEnabled, setLongWaitEnabled] = useState(true)
  const [longWaitMinutes, setLongWaitMinutes] = useState(30)
  const [smsEnabled, setSmsEnabled] = useState(true)
  const [smsAudience, setSmsAudience] = useState('앱을 안 쓰는 환자만')
  const [address, setAddress] = useState('부산광역시 해운대구 센텀중앙로 12, 3층')
  const [phone, setPhone] = useState('051-123-4567')
  const [notifications, setNotifications] = useState(notificationRows)

  const changed = () => { setDirty(true); setSaved(false) }
  const requestSave = () => cancelHours !== 24 ? setConfirming(true) : save()
  const save = () => { setDirty(false); setSaved(true); setConfirming(false) }

  return (
    <StaffPage testid="staff-hospital-settings" max="max-w-6xl">
      <PageHead
        title="병원 설정"
        sub="예약 정책과 환자에게 보이는 병원 운영 정보를 관리합니다"
        action={<div className="flex items-center gap-2">{dirty && <span className="text-xs font-medium text-primary">● 저장하지 않은 변경</span>}<button disabled={!dirty} onClick={requestSave} className={btnPrimary}>저장</button></div>}
      />
      {saved && <div className="mb-3 flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary"><CheckCircle2 className="h-4 w-4" />변경 내용을 저장했습니다. 환자에게 자동 알림은 보내지 않았습니다.</div>}

      <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
        <Panel pad="p-2">
          <nav className="space-y-1" aria-label="병원 설정 메뉴">
            {sections.map((item) => (
              <button key={item.key} onClick={() => setSection(item.key)} className={`w-full rounded-lg px-3 py-2.5 text-left ${section === item.key ? 'bg-primary/10 text-primary' : 'hover:bg-muted'}`}>
                <span className="flex items-center gap-2 text-sm font-semibold">{dirty && section !== item.key && <span aria-hidden>●</span>}{item.label}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{item.sub}</span>
              </button>
            ))}
          </nav>
        </Panel>

        {section === 'booking' && <BookingSettings cancelHours={cancelHours} autoConfirm={autoConfirm} onHours={(value) => { setCancelHours(value); changed() }} onAutoConfirm={(value) => { setAutoConfirm(value); changed() }} />}
        {section === 'waiting' && <WaitingSettings enabled={longWaitEnabled} minutes={longWaitMinutes} onEnabled={(value) => { setLongWaitEnabled(value); changed() }} onMinutes={(value) => { setLongWaitMinutes(value); changed() }} />}
        {section === 'sms' && <SmsSettings enabled={smsEnabled} audience={smsAudience} onEnabled={(value) => { setSmsEnabled(value); changed() }} onAudience={(value) => { setSmsAudience(value); changed() }} />}
        {section === 'info' && <InfoSettings address={address} phone={phone} onAddress={(value) => { setAddress(value); changed() }} onPhone={(value) => { setPhone(value); changed() }} />}
        {section === 'notifications' && <NotificationSettings rows={notifications} smsEnabled={smsEnabled} onRows={(rows) => { setNotifications(rows); changed() }} onGoToSms={() => setSection('sms')} />}
      </div>

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4" role="dialog" aria-modal="true" aria-labelledby="save-settings-title">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3"><div><h3 id="save-settings-title" className="font-bold">취소 마감을 {cancelHours}시간으로 바꿀까요?</h3><p className="mt-1 text-sm text-muted-foreground">이 변경은 지금 잡혀 있는 예약에도 즉시 적용됩니다.</p></div><button onClick={() => setConfirming(false)} aria-label="닫기"><X className="h-5 w-5 text-muted-foreground" /></button></div>
            <div className="mt-4 rounded-lg border border-border bg-muted/60 p-3"><div className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4 text-primary" />예약 4건이 새로 마감 후가 됩니다</div><p className="mt-1 text-xs text-muted-foreground">해당 환자는 앱에서 직접 취소하지 못하고 상담(직원 확인)으로 연결됩니다. 환자에게 자동 알림은 나가지 않습니다.</p></div>
            <div className="mt-5 flex justify-end gap-2"><button onClick={() => setConfirming(false)} className={btnGhost}>그대로 둘게요</button><button onClick={save} className={btnPrimary}>바꾸기</button></div>
          </div>
        </div>
      )}
    </StaffPage>
  )
}

function BookingSettings({ cancelHours, autoConfirm, onHours, onAutoConfirm }: { cancelHours: number; autoConfirm: boolean; onHours: (value: number) => void; onAutoConfirm: (value: boolean) => void }) {
  return <Panel title={<Title icon={<Settings2 className="h-4 w-4 text-primary" />} text="예약 규칙" />}><div className="divide-y divide-border/60"><SettingRow label="취소 마감" description="병원 전체 예약에 즉시 적용됩니다. 마감 후에는 취소가 거절되지 않고 상담으로 연결됩니다."><div className="flex items-center gap-2"><input type="number" min={0} max={168} value={cancelHours} onChange={(event) => onHours(Number(event.target.value))} className={`${inputClass} w-24`} /><span className="text-sm">시간 전까지</span></div></SettingRow><SettingRow label="앱 예약 자동확정" description={autoConfirm ? '켜짐 — 환자 예약을 바로 확정합니다.' : '꺼짐 — 직원이 확인한 뒤 확정됩니다.'}><Switch checked={autoConfirm} onChange={onAutoConfirm} label="앱 예약 자동확정" /></SettingRow></div><AuditLine /></Panel>
}

function WaitingSettings({ enabled, minutes, onEnabled, onMinutes }: { enabled: boolean; minutes: number; onEnabled: (value: boolean) => void; onMinutes: (value: number) => void }) {
  return <Panel title="대기실 운영"><SettingRow label="오래 기다리는 환자 표시" description="이 시간이 지나면 오늘 현황에 확인 카드가 나타납니다. 운영 통계 집계는 꺼도 계속됩니다."><div className="flex items-center gap-3"><Switch checked={enabled} onChange={onEnabled} label="오래 대기 표시" /><input disabled={!enabled} type="number" min={1} max={180} value={minutes} onChange={(event) => onMinutes(Number(event.target.value))} className={`${inputClass} w-20`} /><span className="text-sm">분 이상</span></div></SettingRow><AuditLine /></Panel>
}

function SmsSettings({ enabled, audience, onEnabled, onAudience }: { enabled: boolean; audience: string; onEnabled: (value: boolean) => void; onAudience: (value: string) => void }) {
  return <Panel title={<Title icon={<MessageCircle className="h-4 w-4 text-primary" />} text="문자 발송" />}><div className="divide-y divide-border/60"><SettingRow label="문자 사용" description="보낼 때마다 병원이 비용을 냅니다. 발송업체 계정은 병원에서 따로 준비합니다."><Switch checked={enabled} onChange={onEnabled} label="문자 사용" /></SettingRow><SettingRow label="누구에게 보낼까요?" description="앱을 지웠거나 휴대전화를 바꾼 환자도 앱 미사용 환자에 들어갑니다."><select disabled={!enabled} value={audience} onChange={(event) => onAudience(event.target.value)} className={`${inputClass} w-56`}><option>앱을 안 쓰는 환자만</option><option>모든 환자</option></select></SettingRow></div><AuditLine /></Panel>
}

function InfoSettings({ address, phone, onAddress, onPhone }: { address: string; phone: string; onAddress: (value: string) => void; onPhone: (value: string) => void }) {
  return <Panel title={<Title icon={<Hospital className="h-4 w-4 text-primary" />} text="병원 정보" />}><div className="mb-4 rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary">이 정보는 환자 앱과 취소 상담 안내에 그대로 보입니다.</div><div className="space-y-4"><label className="block text-sm"><span className="mb-1 block font-medium">주소</span><input value={address} onChange={(event) => onAddress(event.target.value)} className={inputClass} /></label><label className="block text-sm"><span className="mb-1 block font-medium">대표 전화</span><input value={phone} onChange={(event) => onPhone(event.target.value)} className={inputClass} /></label><div className="rounded-lg border border-border p-3"><div className="flex items-center justify-between"><div><strong className="text-sm">다가오는 휴무일</strong><p className="text-xs text-muted-foreground">8월 28일 · 병원 전체 휴진</p></div><button className={btnLink}>특정 날짜 변경에서 관리 ›</button></div></div></div><AuditLine /></Panel>
}

function NotificationSettings({ rows, smsEnabled, onRows, onGoToSms }: { rows: typeof notificationRows; smsEnabled: boolean; onRows: (rows: typeof notificationRows) => void; onGoToSms: () => void }) {
  return <Panel title={<Title icon={<Bell className="h-4 w-4 text-primary" />} text="알림" />} pad="p-0">{!smsEnabled && <div className="m-3 flex items-center justify-between rounded-lg bg-muted px-3 py-2 text-sm"><span>문자 발송이 꺼져 있어 「문자로도」를 고를 수 없습니다.</span><button onClick={onGoToSms} className={btnLink}>문자 발송 설정으로 ›</button></div>}<div className="grid grid-cols-[120px_minmax(0,1fr)_90px] gap-3 border-y border-border/70 bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground"><span>종류</span><span>문구</span><span>문자로도</span></div><div className="divide-y divide-border/60">{rows.map((row) => <div key={row.id} className="grid grid-cols-[120px_minmax(0,1fr)_90px] items-center gap-3 px-4 py-3"><strong className="text-sm">{row.label}</strong><div><input value={row.body} onChange={(event) => onRows(rows.map((item) => item.id === row.id ? { ...item, body: event.target.value } : item))} className={inputClass} /><div className="mt-1 flex gap-1">{['환자 이름', '날짜', '시각'].map((token) => <Tag key={token}>{token} 넣기</Tag>)}</div></div><Switch checked={row.sms} disabled={!smsEnabled} onChange={(checked) => onRows(rows.map((item) => item.id === row.id ? { ...item, sms: checked } : item))} label={`${row.label} 문자`} /></div>)}</div><p className="px-4 py-3 text-xs text-muted-foreground">진료과 · 의사 이름 · 증상은 넣지 마세요. 당일 접수 환자는 시각이 없어 해당 부분이 빠집니다.</p></Panel>
}

function SettingRow({ label, description, children }: { label: string; description: string; children: ReactNode }) {
  return <div className="grid gap-4 py-5 sm:grid-cols-[minmax(0,1fr)_auto]"><div><h4 className="text-sm font-semibold">{label}</h4><p className="mt-1 max-w-xl text-xs text-muted-foreground">{description}</p></div><div className="flex items-center">{children}</div></div>
}

function Switch({ checked, onChange, label, disabled = false }: { checked: boolean; onChange: (value: boolean) => void; label: string; disabled?: boolean }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)} className={`relative h-6 w-11 rounded-full transition-colors ${checked ? 'bg-primary' : 'bg-muted'} disabled:opacity-50`}><span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-card shadow-sm transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'}`} /></button>
}

function Title({ icon, text }: { icon: ReactNode; text: string }) { return <span className="flex items-center gap-2">{icon}{text}</span> }
function AuditLine() { return <button className="mt-3 text-xs text-muted-foreground hover:text-foreground">마지막 변경 · 8월 10일 김민지 · 이력 보기</button> }
const inputClass = 'h-9 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40 disabled:bg-muted disabled:text-muted-foreground'
