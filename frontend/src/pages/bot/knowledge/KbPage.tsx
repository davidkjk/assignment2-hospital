import { useState } from 'react'
import { FileText } from '../../../components/icons'
import { StaffPage, btnPrimary } from '../../../components/staff-ui'
import { kbAdminApi, type KbAdminApi } from '../../../api/kbAdmin'
import { KbList } from './KbList'
import { KbEditor } from './KbEditor'
import { KbHistory } from './KbHistory'
import { useKbList } from './useKbList'
import { KB_CATEGORIES } from './constants'

// 병원 안내자료 관리(/bot/knowledge · 관리자 전용) — 데모 좌목록·우편집 레이아웃에 실 계약을 배선한다.
// 왼쪽=목록(분류·상태 필터), 오른쪽=편집/승인 또는 수정이력. 저장만으로 공개되지 않고 승인해야 반영된다.

type View =
  | { k: 'empty' }
  | { k: 'edit'; id: string; prefill?: { title: string; content: string } }
  | { k: 'history'; id: string }

export function KbPage({ api = kbAdminApi }: { api?: KbAdminApi }) {
  const list = useKbList(api)
  const [view, setView] = useState<View>({ k: 'empty' })
  const [creating, setCreating] = useState(false)

  const selId = view.k === 'edit' || view.k === 'history' ? view.id : null

  const onNew = () => {
    setCreating(true)
    api
      .createDoc({ title: '', content: '', category: KB_CATEGORIES[0], isRestricted: false })
      .then((doc) => {
        list.retry() // 새 초안을 목록에 반영
        setView({ k: 'edit', id: doc.id })
      })
      .finally(() => setCreating(false))
  }

  return (
    <StaffPage max="max-w-full" testid="bot-knowledge">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">병원 안내자료</h1>
          <p className="text-xs text-muted-foreground">상담봇이 답할 때 근거로 삼는 자료입니다. 저장만으로는 공개되지 않고, 승인해야 답변에 반영됩니다.</p>
        </div>
        <button className={`${btnPrimary} disabled:opacity-50`} disabled={creating} onClick={onNew}>
          <FileText className="h-4 w-4" /> {creating ? '만드는 중…' : '새 안내자료'}
        </button>
      </div>

      <div className="flex gap-4" style={{ height: 'calc(100vh - 12rem)' }}>
        <div className="w-96 shrink-0">
          <KbList
            docs={list.docs}
            phase={list.phase}
            filters={list.filters}
            onFilter={list.setFilter}
            onOpen={({ id }) => setView({ k: 'edit', id })}
            onRetry={list.retry}
            statusContract={list.statusContract}
            selectedId={selId}
          />
        </div>

        <div className="min-w-0 flex-1 overflow-hidden rounded-xl border border-border/70 bg-card shadow-[0_1px_2px_rgba(16,45,50,0.04)]">
          {view.k === 'empty' && (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <FileText className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm font-medium text-muted-foreground">왼쪽에서 자료를 고르거나 [새 안내자료]로 시작하세요</p>
            </div>
          )}
          {view.k === 'edit' && (
            <KbEditor
              key={`${view.id}${view.prefill ? ':rev' : ''}`}
              api={api}
              docId={view.id}
              prefill={view.prefill}
              onGotoRevision={(id) => setView({ k: 'history', id })}
            />
          )}
          {view.k === 'history' && (
            <KbHistory
              api={api}
              docId={view.id}
              onEditRevision={(t) => setView({ k: 'edit', id: view.id, prefill: { title: t.title, content: t.content } })}
              onBackToList={() => setView({ k: 'empty' })}
            />
          )}
        </div>
      </div>
    </StaffPage>
  )
}
