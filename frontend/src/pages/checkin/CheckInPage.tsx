import { CheckinForm } from './CheckinForm'
import type { QrScannerFactory } from './QrScanner'

/**
 * `/checkin` QR·예약번호 접수 — 접수직원·관리자(셸 route guard가 막는다, `CHKIN-HEAD-02·03`).
 * 제목·오프라인 띠·세 문 헤더는 공통 셸이 그린다 — 이 화면은 본문만 만든다.
 *
 * ⭐ 본문은 `CheckinForm` 하나다 — 헤더 「접수」 문의 「예약 확인」 갈래가 **같은 컴포넌트**를 쓴다
 *    (데모 `checkin/Checkin.tsx`와 같은 구조). 접수 규칙을 두 곳에 베껴 두지 않기 위해서다.
 * 📌 `/checkin`은 정본 route로 살아 있으나(딥링크 대비) **주 진입은 헤더 세 문 `[접수]`**다
 *    (`CHKIN-HEAD-02` — 사이드바에 접수 항목은 없다).
 */
export function CheckInPage({ scannerFactory }: { scannerFactory?: QrScannerFactory }) {
  return (
    <section aria-label="QR·예약번호 접수" className="mx-auto max-w-xl">
      <CheckinForm scannerFactory={scannerFactory} />
    </section>
  )
}
