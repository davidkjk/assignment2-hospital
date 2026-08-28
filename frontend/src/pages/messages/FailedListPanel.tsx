import { useState, type CSSProperties } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { EmptyState } from '../../components/EmptyState'
import { InlineError } from '../../components/InlineError'
import { getFailedList, type FailedItem } from '../../api/messages'

// [Task 30][SEND-FAIL-*] 안 닿은 명단 — 두 무리로 가른다.
//   지금 전화(번호 살아있고 문자만 실패) ↔ 번호 고쳐야 함(번호 자체가 죽음).
//   0건인 무리는 탭이 사라지고(SEND-FAIL-05), 남은 하나면 탭 없이 명단만 보인다.
//   ⛔ [다시 보내기]는 두지 않는다(SEND-RETRY-06). '번호 고쳐야 함'은 [환자 열기]로만.

// SEND-FAIL-07 — 왜 안 갔나(사람 문장). 코드→문구.
const REASON_LABEL: Record<string, string> = {
  invalid_number: '없는 번호',
  unreachable: '없는 번호',
  landline: '문자가 안 되는 번호',
  blocked: '문자 수신 차단',
  push_unregistered: '앱을 지웠고 문자도 실패',
  sms_disabled: '문자를 보낼 수 없음',
}
function reasonOf(code: string | null): string {
  return (code && REASON_LABEL[code]) || '전송 실패'
}

type TabKey = 'call_now' | 'fix_number'

export function FailedListPanel({ batchId }: { batchId: string }) {
  const query = useQuery({
    queryKey: ['messages', 'failed', batchId],
    queryFn: () => getFailedList(batchId),
  })

  const [tab, setTab] = useState<TabKey>('call_now')

  if (query.isError) return <InlineError message="안 닿은 명단을 불러오지 못했습니다." />
  if (!query.data) return <p style={styles.loading}>불러오는 중…</p>

  const { call_now, fix_number } = query.data
  const allTabs: { key: TabKey; label: string; items: FailedItem[] }[] = [
    { key: 'call_now', label: '지금 전화', items: call_now },
    { key: 'fix_number', label: '번호 고쳐야 함', items: fix_number },
  ]
  const tabs = allTabs.filter((t) => t.items.length > 0) // SEND-FAIL-05 — 0건 탭은 사라진다

  if (tabs.length === 0) {
    return <EmptyState kind="zero" message="안 닿은 사람이 없습니다" />
  }

  // 남은 탭이 하나뿐이면 탭 없이 그 명단만(SEND-FAIL-05).
  const active = tabs.find((t) => t.key === tab) ?? tabs[0]

  return (
    <div style={styles.wrap}>
      {tabs.length > 1 && (
        <div role="tablist" style={styles.tabs}>
          {tabs.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={active.key === t.key}
              style={{ ...styles.tab, ...(active.key === t.key ? styles.tabOn : null) }}
              onClick={() => setTab(t.key)}
            >
              {t.label} {t.items.length}
            </button>
          ))}
        </div>
      )}
      <FailedGroup tabKey={active.key} items={active.items} />
    </div>
  )
}

function FailedGroup({ tabKey, items }: { tabKey: TabKey; items: FailedItem[] }) {
  // SEND-FAIL-09 — 지난 발송에서 이미 확인된(죽은) 번호는 접어둔다.
  const fresh = items.filter((i) => !i.already_known)
  const known = items.filter((i) => i.already_known)
  const [showKnown, setShowKnown] = useState(false)

  return (
    <div>
      <ul style={styles.list}>
        {fresh.map((i) => (
          <FailedRow key={i.id} item={i} isFix={tabKey === 'fix_number'} />
        ))}
      </ul>
      {known.length > 0 && (
        <>
          <button type="button" style={styles.knownFold} onClick={() => setShowKnown((v) => !v)}>
            그중 {known.length}명은 지난 발송에서 이미 확인된 번호 ›
          </button>
          {showKnown && (
            <ul style={styles.list}>
              {known.map((i) => (
                <FailedRow key={i.id} item={i} isFix={tabKey === 'fix_number'} />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}

function FailedRow({ item, isFix }: { item: FailedItem; isFix: boolean }) {
  return (
    <li style={styles.row}>
      <span style={styles.name}>{item.name}</span>
      <span style={styles.phone}>{item.phone}</span>
      <span style={styles.reason}>{reasonOf(item.failure_code)}</span>
      {isFix && item.patient_id && (
        // SEND-FAIL-08 — 번호 고치는 자리로 보낸다. ⛔ [다시 보내기] 없음(SEND-RETRY-06).
        <Link to={`/patients/${item.patient_id}`} style={styles.openBtn}>
          환자 열기
        </Link>
      )}
    </li>
  )
}

const styles: Record<string, CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 12 },
  loading: { color: 'var(--color-ink-muted)' },
  tabs: { display: 'flex', gap: 4, borderBottom: '1px solid var(--color-divider)' },
  tab: {
    padding: '8px 12px',
    background: 'none',
    border: 'none',
    borderBottom: '2px solid transparent',
    color: 'var(--color-ink-muted)',
    fontSize: 'var(--fs-base)',
    fontWeight: 600,
    cursor: 'pointer',
  },
  tabOn: { color: 'var(--color-primary)', borderBottom: '2px solid var(--color-primary)' },
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 10px',
    border: '1px solid var(--color-divider)',
    borderRadius: 8,
  },
  name: { fontWeight: 600, color: 'var(--color-ink)', minWidth: 72 },
  phone: { fontVariantNumeric: 'tabular-nums', color: 'var(--color-ink)' },
  reason: { flex: 1, color: 'var(--color-danger, #b42318)', fontSize: 'var(--fs-sm)' },
  openBtn: {
    padding: '4px 10px',
    borderRadius: 6,
    border: '1px solid var(--color-divider)',
    color: 'var(--color-primary)',
    textDecoration: 'none',
    fontSize: 'var(--fs-sm)',
    fontWeight: 600,
  },
  knownFold: {
    marginTop: 8,
    background: 'none',
    border: 'none',
    color: 'var(--color-ink-muted)',
    fontSize: 'var(--fs-sm)',
    cursor: 'pointer',
    padding: 0,
    textAlign: 'left',
  },
}
