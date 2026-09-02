import { useEffect, useState } from 'react'
import { btnGhost } from '../../../components/staff-ui'
import type { Example, QualityApi } from '../../../api/qualityAdmin'

// 참고 예시 관리(QAEX-LIST-*) — 「향후 유사 질문 예시로도 사용」으로 등록된 교정(qa_example_bank) 목록.
// 비활성화는 삭제가 아니라 참고하지 않는 상태로 바꾸는 것(03·06). 재활성화·편집은 계약이 없어 두지 않는다(확인 필요).
// 처리 중 중복 차단(04)·실패는 활성 유지(05)·동시 변경(409)은 최신 상태 재조회(07)·0건↔오류 구분(08·10).
// 시각 뼈대 = 데모 bot/Quality.tsx 하단 「참고 예시」 절.

type Phase = 'loading' | 'ready' | 'empty' | 'error'
type RowState = { k: 'idle' } | { k: 'busy' } | { k: 'failed' } | { k: 'done' } | { k: 'conflict' }

export function ExampleBank({ api }: { api: QualityApi }) {
  const [phase, setPhase] = useState<Phase>('loading')
  const [rows, setRows] = useState<Example[]>([])
  const [states, setStates] = useState<Record<string, RowState>>({})

  const load = () => {
    setPhase('loading')
    api
      .listExamples(true)
      .then((r) => {
        setRows(r)
        setStates({})
        setPhase(r.length === 0 ? 'empty' : 'ready')
      })
      .catch(() => setPhase('error')) // 0건으로 표시하지 않는다(10)
  }
  useEffect(load, [api])

  const setState = (id: string, s: RowState) => setStates((prev) => ({ ...prev, [id]: s }))

  const deactivate = (id: string) => {
    if (states[id]?.k === 'busy') return
    setState(id, { k: 'busy' })
    api
      .deactivateExample(id)
      .then(() => {
        setRows((prev) => prev.map((e) => (e.id === id ? { ...e, active: false } : e))) // 비활성 반영, 삭제 아님(06)
        setState(id, { k: 'done' })
      })
      .catch((err: unknown) => {
        const status = (err as { status?: number } | null)?.status
        if (status === 409) {
          setState(id, { k: 'conflict' }) // 성공으로 가장하지 않고 최신 상태로(07)
          api.listExamples(true).then((r) => setRows(r)).catch(() => {})
        } else {
          setState(id, { k: 'failed' }) // 활성 유지(05)
        }
      })
  }

  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold">참고 예시</h3>
      <p className="mb-2 text-xs text-muted-foreground">「향후 유사 질문 예시로도 사용」으로 등록된 교정입니다. 비활성화하면 상담봇이 더 이상 참고하지 않습니다(삭제 아님).</p>
      <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-[0_1px_2px_rgba(16,45,50,0.04)]">
        {phase === 'loading' && (
          <div aria-label="예시 로딩" className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-primary" /> 참고 예시를 불러오는 중…
          </div>
        )}
        {phase === 'error' && (
          <div className="flex flex-col items-center gap-3 px-4 py-6 text-center">
            <p className="text-sm font-medium">참고 예시를 불러오지 못했습니다</p>
            <button className={btnGhost} onClick={load}>다시 시도</button>
          </div>
        )}
        {phase === 'empty' && <p className="px-4 py-6 text-center text-sm text-muted-foreground">등록된 참고 예시가 없습니다</p>}
        {phase === 'ready' &&
          rows.map((e) => {
            const st = states[e.id] ?? { k: 'idle' }
            return (
              <div key={e.id} data-testid="example-row" data-active={e.active} className="border-b border-border/60 px-4 py-3 last:border-b-0">
                <div className="flex items-start justify-between gap-3">
                  <div className={`min-w-0 flex-1 ${e.active ? '' : 'opacity-50'}`}>
                    <div className="text-sm font-medium">Q. {e.question}</div>
                    <div className="mt-0.5 text-sm text-muted-foreground">A. {e.answer}</div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {e.active ? (
                      <button className={`${btnGhost} px-2.5 py-1`} disabled={st.k === 'busy'} onClick={() => deactivate(e.id)}>
                        {st.k === 'busy' ? '처리 중…' : st.k === 'failed' ? '다시 시도' : '비활성화'}
                      </button>
                    ) : (
                      <span className="rounded bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">비활성</span>
                    )}
                    {st.k === 'done' && <span className="text-[11px] text-emerald-700">비활성 처리했습니다</span>}
                    {st.k === 'failed' && <span className="text-[11px] text-rose-700">처리하지 못했습니다</span>}
                    {st.k === 'conflict' && <span className="text-[11px] text-muted-foreground">이미 다른 관리자가 변경했습니다</span>}
                  </div>
                </div>
              </div>
            )
          })}
      </div>
    </section>
  )
}
