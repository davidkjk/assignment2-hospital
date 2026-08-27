import type { CSSProperties } from 'react'
import { PatientSearch } from './PatientSearch'

// /patients 라우트 래퍼 — 셸(AppShell) 본문에 놓인다. 역할 가드·nav 등록은 App.tsx(Task 4)가,
// 이 페이지는 제목과 공유 부품 <PatientSearch>만 놓는다. 접수 업무 셋의 공통 출발점이라(SB-18)
// 검색 상자를 화면의 주인공으로 올려 두고, 찾은 줄에서 바로 처리로 갈라지게 한다.

export function PatientSearchPage() {
  return (
    <section style={styles.page}>
      <header style={styles.head}>
        <h1 style={styles.title}>환자 검색</h1>
        <p style={styles.sub}>이름 조각·전화·생년월일 중 아는 것을 넣으면, 찾은 줄에서 바로 접수·예약·방문 등록으로 이어집니다.</p>
      </header>
      <PatientSearch mode="page" />
    </section>
  )
}

const styles: Record<string, CSSProperties> = {
  page: { display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 880 },
  head: { display: 'flex', flexDirection: 'column', gap: 2 },
  title: { margin: 0, fontSize: 'var(--fs-xl)', fontWeight: 800, color: 'var(--color-ink)' },
  sub: { margin: 0, fontSize: 'var(--fs-sm)', color: 'var(--color-ink-muted)' },
}
