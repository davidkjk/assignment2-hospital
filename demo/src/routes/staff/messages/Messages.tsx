import { useState } from 'react'
import { Send, ChevronRight, ChevronDown, X, Search, Eye, AlertTriangle, Clock3, Users } from '@/components/icons'
import { StaffPage, PageHead, PeriodSelect, Tag, btnPrimary, btnGhost, btnLink } from '../_ui'
import { maskPhone } from '../mockData'
import {
  sentMessages,
  scheduledMessages,
  autoSendCount,
  autoSendMessages,
  patientSearchResults,
  type Message,
  type Kind,
  type Channel,
  type Recipient,
} from './mockData'

// 안내 보내기 (/staff/messages) — SEND-*.
// 제1문 화면: 위 「예약해 둔 것」 + 아래 「보낸 것」 (예약해 둔 것 0건이면 그 구역 사라짐, SEND-LIST-02).
// ⭐ 발송 결과를 진짜로 보여준다(SEND-RESULT-*) — "보냈다"가 아니라 "도달/실패" — "조용히 줄어드는 것"을 막는다.
// 「대상 N명」→ 명단(번호 마스킹, [전화번호 모두 보기]=열람 기록, SEND-OPEN-*).
// data-testid="staff-messages".

export function Messages() {
  const [showAuto, setShowAuto] = useState(false)
  const [composing, setComposing] = useState(false)
  const [listOf, setListOf] = useState<Message | null>(null)
  const [failsOf, setFailsOf] = useState<Message | null>(null)
  const [detailOf, setDetailOf] = useState<{ m: Message; scheduled: boolean } | null>(null)

  return (
    <StaffPage max="max-w-5xl" testid="staff-messages">
      <PageHead
        title="안내 보내기"
        action={
          <div className="flex items-center gap-2">
            <PeriodSelect />
            <button className={btnPrimary} onClick={() => setComposing(true)}>
              <Send className="h-4 w-4" /> 새로 보내기
            </button>
          </div>
        }
      />

      {/* 예약해 둔 것 — 0건이면 통째로 사라진다 (SEND-LIST-02) */}
      {scheduledMessages.length > 0 && (
        <section className="mb-5">
          <SectionTitle>예약해 둔 것</SectionTitle>
          <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-[0_1px_2px_rgba(16,45,50,0.04)]">
            <RowHead scheduled />
            {scheduledMessages.map((m) => (
              <MessageRow key={m.id} m={m} scheduled onTargets={() => setListOf(m)} onDetail={() => setDetailOf({ m, scheduled: true })} />
            ))}
          </div>
        </section>
      )}

      {/* 보낸 것 */}
      <section>
        <SectionTitle>보낸 것</SectionTitle>
        <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-[0_1px_2px_rgba(16,45,50,0.04)]">
          <RowHead />
          {sentMessages.map((m) => (
            <MessageRow key={m.id} m={m} onTargets={() => setListOf(m)} onFails={() => setFailsOf(m)} onDetail={() => setDetailOf({ m, scheduled: false })} />
          ))}
        </div>

        {/* 자동 발송은 접어 둔다 (SEND-LIST-08) */}
        <button
          className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg py-2 text-sm text-muted-foreground hover:bg-muted"
          onClick={() => setShowAuto((v) => !v)}
        >
          {showAuto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          자동 발송 {autoSendCount}건 {showAuto ? '접기' : '보기'}
        </button>
        {showAuto && (
          <div className="mt-2">
            <p className="mb-2 px-1 text-xs text-muted-foreground">
              전날·당일 예약 알림, 사전문진 안내처럼 시스템이 자동으로 보내는 것입니다 · 최근 발송분
            </p>
            <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-[0_1px_2px_rgba(16,45,50,0.04)]">
              <RowHead />
              {autoSendMessages.map((m) => (
                <MessageRow key={m.id} m={m} onTargets={() => setListOf(m)} onFails={() => setFailsOf(m)} onDetail={() => setDetailOf({ m, scheduled: false })} />
              ))}
            </div>
          </div>
        )}
      </section>

      {composing && <ComposePanel onClose={() => setComposing(false)} />}
      {detailOf && (
        <MessageDetail
          m={detailOf.m}
          scheduled={detailOf.scheduled}
          onClose={() => setDetailOf(null)}
          onTargets={() => { setListOf(detailOf.m); setDetailOf(null) }}
          onFails={() => { setFailsOf(detailOf.m); setDetailOf(null) }}
        />
      )}
      {listOf && <RecipientList m={listOf} onClose={() => setListOf(null)} />}
      {failsOf && <FailList m={failsOf} onClose={() => setFailsOf(null)} />}
    </StaffPage>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-2 text-sm font-semibold text-muted-foreground">{children}</h3>
}

// 7칸: 종류 · 내용 · 보낸 직원 · 채널 · 시각 · 대상 수 · 발송 결과 (SEND-LIST-06)
const GRID = 'grid grid-cols-[64px_1fr_84px_128px_96px_92px_180px] items-center gap-3'

function RowHead({ scheduled }: { scheduled?: boolean }) {
  return (
    <div className={`${GRID} border-b border-border/70 bg-muted/40 px-4 py-2 text-sm font-medium text-muted-foreground`}>
      <span>종류</span>
      <span>내용</span>
      <span>{scheduled ? '예약한 직원' : '보낸 직원'}</span>
      <span>채널</span>
      <span>{scheduled ? '보낼 시각' : '보낸 시각'}</span>
      <span className="text-right">대상</span>
      <span>{scheduled ? '' : '발송 결과'}</span>
    </div>
  )
}

function MessageRow({
  m,
  scheduled,
  onTargets,
  onFails,
  onDetail,
}: {
  m: Message
  scheduled?: boolean
  onTargets: () => void
  onFails?: () => void
  onDetail?: () => void
}) {
  return (
    <div className={`${GRID} border-b border-border/60 px-4 py-2.5 text-sm last:border-b-0`}>
      <span>
        <Tag className={m.kind === '광고' ? 'bg-amber-100 text-amber-800' : 'bg-sky-100 text-sky-700'}>{m.kind}</Tag>
      </span>
      {/* 내용을 누르면 발송 상세가 열린다 (열람 + 예약건은 발송 취소) */}
      <button className="truncate text-left font-medium hover:text-primary hover:underline" title={m.content} onClick={onDetail}>{m.content}</button>
      <span className="text-muted-foreground">{m.staff}</span>
      <span className="text-xs text-muted-foreground">{m.channel}</span>
      <span className="text-xs tabular-nums text-muted-foreground">{m.at}</span>
      <span className="text-right">
        <button className={`${btnLink} tabular-nums`} onClick={onTargets}>
          {m.targetCount.toLocaleString()}명
        </button>
      </span>
      <span>
        {scheduled ? (
          <button className={btnLink}>발송 취소</button>
        ) : (
          <ResultCell m={m} onFails={onFails} />
        )}
      </span>
    </div>
  )
}

function ResultCell({ m, onFails }: { m: Message; onFails?: () => void }) {
  if (m.sending) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-sky-700">
        <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-sky-300 border-t-sky-600" />
        도달 {m.reached}건 · 발송 중
      </span>
    )
  }
  const failed = m.failed ?? 0
  if (failed === 0) {
    // 실패 0건은 "실패 0"을 적지 않는다 (SEND-RESULT-14)
    return <span className="text-xs tabular-nums text-emerald-700">도달 {m.reached?.toLocaleString()}건</span>
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs tabular-nums">
      <span className="text-emerald-700">도달 {m.reached?.toLocaleString()}</span>
      <span className="text-rose-600">실패 {failed}</span>
      <button className={`${btnLink} whitespace-nowrap`} onClick={onFails}>안 닿은 {failed}명 보기</button>
    </span>
  )
}

// ── 대상 명단 (번호 마스킹 + 2단계 열람) — SEND-OPEN-* ──
function RecipientList({ m, onClose }: { m: Message; onClose: () => void }) {
  const [revealed, setRevealed] = useState(false)
  const [confirmReveal, setConfirmReveal] = useState(false)
  const recipients = m.recipients ?? []

  return (
    <Modal title={`대상 명단 · ${m.targetCount.toLocaleString()}명`} onClose={onClose}>
      <p className="mb-3 text-xs text-muted-foreground">「{m.content}」 · {m.at}</p>

      {recipients.length === 0 ? (
        <p className="rounded-lg bg-muted/50 px-3 py-6 text-center text-sm text-muted-foreground">
          {m.targetCount.toLocaleString()}명에게 보냈습니다. 전 환자 발송은 개별 명단을 펼치지 않습니다.
        </p>
      ) : (
        <>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">이름 · 번호 · 발송 결과</span>
            {!revealed ? (
              <button className={btnGhost} onClick={() => setConfirmReveal(true)}>
                <Eye className="h-4 w-4" /> 전화번호 모두 보기
              </button>
            ) : (
              <span className="text-xs text-amber-700">번호를 열람했습니다 · 기록에 남습니다</span>
            )}
          </div>
          <ul className="max-h-72 divide-y divide-border/60 overflow-y-auto rounded-lg border border-border/70">
            {recipients.map((r, i) => (
              <li key={i} className="grid grid-cols-[1fr_130px_92px] items-center gap-2 px-3 py-1.5 text-sm">
                <span className="font-medium">{r.name}</span>
                <span className="tabular-nums text-muted-foreground">{revealed ? r.phone : maskPhone(r.phone)}</span>
                <RecipientResult r={r} />
              </li>
            ))}
          </ul>
        </>
      )}

      {confirmReveal && (
        <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
          <p className="flex items-start gap-1.5 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            전화번호를 모두 표시합니다. <b className="font-semibold">열람 기록이 남습니다.</b>
          </p>
          <div className="mt-2 flex justify-end gap-2">
            <button className={btnGhost} onClick={() => setConfirmReveal(false)}>그만두기</button>
            <button className={btnPrimary} onClick={() => { setRevealed(true); setConfirmReveal(false) }}>
              번호 표시
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}

function RecipientResult({ r }: { r: Recipient }) {
  if (r.state === '도달') return <span className="text-right text-xs text-emerald-700">도달</span>
  if (r.state === '실패') return <span className="text-right text-xs text-rose-600">실패</span>
  return <span className="text-right text-xs text-sky-700">{r.state}</span>
}

// ── 안 닿은 명단 — 탭으로 가른다: 지금 전화 / 번호 고쳐야 함 (SEND-FAIL-02·06) ──
function FailList({ m, onClose }: { m: Message; onClose: () => void }) {
  const fails = (m.recipients ?? []).filter((r) => r.state === '실패')
  // "지금 전화" = 번호는 살아 있음(문자 차단·앱 지움), "번호 고쳐야 함" = 없는 번호
  const callNow = fails.filter((r) => r.failReason !== '없는 번호')
  const fixNumber = fails.filter((r) => r.failReason === '없는 번호')
  const tabs = [
    { key: 'call', label: '지금 전화', list: callNow },
    { key: 'fix', label: '번호 고쳐야 함', list: fixNumber },
  ].filter((t) => t.list.length > 0)
  const [tab, setTab] = useState(tabs[0]?.key ?? 'call')
  const active = tabs.find((t) => t.key === tab) ?? tabs[0]

  return (
    <Modal title={`안 닿은 ${fails.length}명`} onClose={onClose}>
      <p className="mb-3 text-xs text-muted-foreground">「{m.content}」 · {m.at}</p>
      {tabs.length > 1 && (
        <div className="mb-3 inline-flex rounded-lg bg-muted p-0.5 text-sm">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`rounded-md px-3 py-1.5 font-medium ${tab === t.key ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}
            >
              {t.label} <span className="tabular-nums">{t.list.length}</span>
            </button>
          ))}
        </div>
      )}
      <p className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Clock3 className="h-3.5 w-3.5" />
        {active?.key === 'fix'
          ? '번호가 죽어 전화도 안 걸립니다. 다음에 병원에 올 때 번호를 고칩니다.'
          : '번호는 살아 있고 문자만 안 갔습니다. 전화로 안내하세요.'}
      </p>
      <ul className="divide-y divide-border/60 rounded-lg border border-border/70">
        {(active?.list ?? []).map((r, i) => (
          <li key={i} className="grid grid-cols-[1fr_130px_140px] items-center gap-2 px-3 py-2 text-sm">
            <span className="font-medium">{r.name}</span>
            <span className="tabular-nums text-muted-foreground">{maskPhone(r.phone)}</span>
            <span className="text-xs text-rose-600">{r.failReason}</span>
          </li>
        ))}
      </ul>
    </Modal>
  )
}

// ── 새로 보내기 패널 (SEND-BOX-*) ──
function ComposePanel({ onClose }: { onClose: () => void }) {
  const [kind, setKind] = useState<Kind>('안내')
  const [channel, setChannel] = useState<Channel>('앱 알림 + 문자')
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<{ id: string; name: string }[]>([])
  const [everyone, setEveryone] = useState(false)
  const results = query.trim()
    ? patientSearchResults.filter((p) => p.name.includes(query.trim()) || p.phone.includes(query.trim()))
    : []
  const rawCount = everyone ? 3120 : picked.length
  // 광고는 수신 동의자만 대상에 남는다 (SEND-ADS-01) — 데모: 약 28%
  const targetCount = kind === '광고' ? Math.round(rawCount * 0.28) : rawCount
  // 채널별 건수 — 돈 드는 문자 수를 그 자리에 보여준다 (SEND-CH-04). 데모: 앱 미설치 약 40%
  const smsCount = channel === '앱 알림만' ? 0 : channel === '문자' ? targetCount : Math.round(targetCount * 0.4)
  const appCount = channel === '문자' ? 0 : targetCount - (channel === '앱 알림만' ? 0 : smsCount)

  return (
    <div className="fixed inset-y-0 right-0 z-40 w-[380px] overflow-y-auto border-l border-border bg-card shadow-2xl">
      <div className="sticky top-0 flex items-center justify-between border-b border-border bg-card px-4 py-3">
        <h3 className="text-sm font-semibold">새로 보내기</h3>
        <button onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted" aria-label="닫기">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="space-y-4 p-4">
        {/* ① 종류 — 맨 위, 아래 전부를 바꾼다 (SEND-KIND-01) */}
        <div>
          <FieldLabel>종류</FieldLabel>
          <div className="inline-flex rounded-lg bg-muted p-0.5 text-sm">
            {(['안내', '광고'] as Kind[]).map((k) => (
              <button
                key={k}
                onClick={() => setKind(k)}
                className={`rounded-md px-3 py-1.5 font-medium ${kind === k ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}
              >
                {k}
              </button>
            ))}
          </div>
          {kind === '광고' && (
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              광고는 수신 동의한 환자에게만 갑니다{rawCount > 0 && <> — <b className="font-semibold text-foreground tabular-nums">{rawCount.toLocaleString()}명 → {targetCount.toLocaleString()}명</b></>}. 제목에 (광고), 본문 끝에 무료 수신거부 방법이 자동으로 붙습니다.
            </p>
          )}
        </div>

        {/* ② 받는 사람 */}
        <div>
          <FieldLabel>받는 사람</FieldLabel>
          {everyone ? (
            <div className="flex items-center justify-between rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm">
              <span className="font-medium text-amber-900">전 환자 3,120명</span>
              <button className={btnLink} onClick={() => setEveryone(false)}>바꾸기</button>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="이름 · 전화번호로 찾기"
                  className="h-9 w-full rounded-lg border border-input bg-card pl-9 pr-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40"
                />
              </div>
              {results.length > 0 && (
                <ul className="mt-1.5 overflow-hidden rounded-lg border border-border">
                  {results.map((p) => (
                    <li key={p.id}>
                      <button
                        className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-muted disabled:opacity-40"
                        disabled={picked.some((x) => x.id === p.id)}
                        onClick={() => { setPicked((v) => [...v, { id: p.id, name: p.name }]); setQuery('') }}
                      >
                        <span className="font-medium">{p.name}</span>
                        <span className="text-xs text-muted-foreground tabular-nums">{maskPhone(p.phone)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {picked.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {picked.map((p) => (
                    <span key={p.id} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                      {p.name}
                      <button onClick={() => setPicked((v) => v.filter((x) => x.id !== p.id))} aria-label="빼기">
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              {/* 전 환자 발송 = 되돌릴 수 없고 비용 큼 → 주 버튼(딥틸) 아님. 단 안 보이면 못 찾으니 테두리 보조 버튼으로. */}
              <div className="mt-3 flex items-center gap-2">
                <span className="h-px flex-1 bg-border" />
                <span className="text-[11px] text-muted-foreground">또는</span>
                <span className="h-px flex-1 bg-border" />
              </div>
              <button
                className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted"
                onClick={() => setEveryone(true)}
              >
                <Users className="h-4 w-4 text-muted-foreground" /> 전 환자에게 보내기
              </button>
            </>
          )}
        </div>

        {/* ③ 보내는 방법 + 건수 (SEND-CH-*) */}
        <div>
          <FieldLabel>보내는 방법</FieldLabel>
          <div className="space-y-1.5">
            {(['앱 알림 + 문자', '앱 알림만', '문자'] as Channel[]).map((c) => (
              <label key={c} className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                <input type="radio" name="ch" checked={channel === c} onChange={() => setChannel(c)} />
                <span>{c}{c === '앱 알림 + 문자' && <span className="ml-1 text-[11px] text-muted-foreground">기본 · 못 받는 사람은 문자</span>}</span>
              </label>
            ))}
          </div>
          {targetCount > 0 && (
            <p className="mt-1.5 text-[11px] tabular-nums text-muted-foreground">
              앱 알림 {appCount.toLocaleString()}건
              {smsCount > 0 && <> · 문자 {smsCount.toLocaleString()}건 — <b className="font-semibold text-amber-700">문자 {smsCount.toLocaleString()}건에 비용이 듭니다</b></>}
            </p>
          )}
        </div>

        {/* ④ 내용 */}
        <div>
          <FieldLabel>내용</FieldLabel>
          <textarea
            rows={4}
            placeholder="환자에게 보낼 안내 내용을 적습니다"
            className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40"
          />
        </div>
      </div>

      <div className="sticky bottom-0 flex gap-2 border-t border-border bg-card px-4 py-3">
        <button className={`${btnGhost} flex-1 justify-center`} disabled={targetCount === 0}>나중에 보내기</button>
        <button className={`${btnPrimary} flex-1 justify-center disabled:opacity-50`} disabled={targetCount === 0}>
          {targetCount > 0 ? `${targetCount.toLocaleString()}명에게 보내기` : '받는 사람을 고르세요'}
        </button>
      </div>
    </div>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <div className="mb-1.5 text-xs font-medium text-muted-foreground">{children}</div>
}

// 발송 상세 — 행을 누르면 열린다. 열람이 기본, 예약해 둔 것만 [발송 취소](SEND-LIST-03). 보낸 것은 되돌릴 수 없다.
function MessageDetail({
  m,
  scheduled,
  onClose,
  onTargets,
  onFails,
}: {
  m: Message
  scheduled: boolean
  onClose: () => void
  onTargets: () => void
  onFails: () => void
}) {
  const failed = m.failed ?? 0
  return (
    <Modal title="발송 상세" onClose={onClose}>
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Tag className={m.kind === '광고' ? 'bg-amber-100 text-amber-800' : 'bg-sky-100 text-sky-700'}>{m.kind}</Tag>
          <span className="text-xs text-muted-foreground">{scheduled ? '보낼 시각' : '보낸 시각'} · {m.at}</span>
        </div>
        <p className="rounded-lg bg-muted/40 px-3 py-2 text-sm">{m.content}</p>
        <dl className="space-y-1.5 text-sm">
          <div className="flex justify-between gap-3"><dt className="text-muted-foreground">{scheduled ? '예약한 직원' : '보낸 직원'}</dt><dd>{m.staff}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted-foreground">보내는 방법</dt><dd>{m.channel}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted-foreground">대상</dt><dd className="tabular-nums">{m.targetCount.toLocaleString()}명</dd></div>
          {!scheduled && (
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">발송 결과</dt>
              <dd className="tabular-nums">
                {m.sending ? `도달 ${m.reached}건 · 발송 중` : `도달 ${m.reached?.toLocaleString()}건${failed ? ` · 실패 ${failed}건` : ''}`}
              </dd>
            </div>
          )}
        </dl>
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border/60 pt-3">
          <button className={btnGhost} onClick={onTargets}>대상 명단 보기</button>
          {!scheduled && failed > 0 && <button className={btnGhost} onClick={onFails}>안 닿은 {failed}명 보기</button>}
          {scheduled ? (
            <button className={btnGhost} onClick={onClose}>발송 취소</button>
          ) : (
            <span className="text-xs text-muted-foreground">보낸 것은 되돌릴 수 없습니다 · 바꾸려면 새로 보내기</span>
          )}
        </div>
      </div>
    </Modal>
  )
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-base font-bold">{title}</h3>
          <button onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted" aria-label="닫기">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
