import type { CSSProperties } from 'react'
import { PatientSearch } from './PatientSearch'

// /patients 라우트 래퍼 — 셸(AppShell) 본문에 놓인다. 역할 가드·nav 등록은 App.tsx(Task 4)가,
// 이 페이지는 제목과 공유 부품 <PatientSearch>만 놓는다. 접수 업무 셋의 공통 출발점이라(SB-18)
// 검색 상자를 화면의 주인공으로 올려 두고, 찾은 줄에서 바로 처리로 갈라지게 한다.

export function PatientSearchPage() {
  return (
    <section style={styles.page}>
      {/* [F-7] 제목 아래 회색 설명 한 줄은 제거(사용자 지시 2026-08-22) — 셸 헤더가 화면명을 진다.
          검색이 무엇으로 되는지는 입력창 placeholder가 이미 말한다. */}
      <header style={styles.head}>
        <h1 style={styles.title}>환자 검색</h1>
      </header>
      <PatientSearch mode="page" />
    </section>
  )
}

const styles: Record<string, CSSProperties> = {
  page: { display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 880 },
  head: { display: 'flex', flexDirection: 'column', gap: 2 },
  title: { margin: 0, fontSize: 'var(--fs-xl)', fontWeight: 800, color: 'var(--color-ink)' },
}
