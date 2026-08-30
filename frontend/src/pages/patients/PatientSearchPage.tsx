import type { CSSProperties } from 'react'
import { PatientSearch } from './PatientSearch'

// /patients 라우트 래퍼 — 셸(AppShell) 본문에 놓인다. 역할 가드·nav 등록은 App.tsx(Task 4)가,
// 이 페이지는 제목과 공유 부품 <PatientSearch>만 놓는다. 접수 업무 셋의 공통 출발점이라(SB-18)
// 검색 상자를 화면의 주인공으로 올려 두고, 찾은 줄에서 바로 처리로 갈라지게 한다.

export function PatientSearchPage() {
  return (
    <section style={styles.page}>
      {/* 화면 제목은 셸 헤더가 그린다(`STAFF-SHELL-02` 개정) — 본문엔 두지 않는다.
          [F-7] 제목 아래 설명 한 줄도 제거(2026-08-22): 검색 대상은 입력창 placeholder가 말한다. */}
      <PatientSearch mode="page" />
    </section>
  )
}

const styles: Record<string, CSSProperties> = {
  page: { display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 880 },
  head: { display: 'flex', flexDirection: 'column', gap: 2 },
  title: { margin: 0, fontSize: 'var(--fs-title)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], color: 'var(--color-ink)' },
}
