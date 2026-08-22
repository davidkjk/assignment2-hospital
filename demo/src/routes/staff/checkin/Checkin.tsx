import { CheckinForm } from './CheckinForm'

// 접수 라우트(/checkin) — 전체 화면. 헤더 [QR 접수] 패널과 같은 폼을 쓴다(CheckinForm).
// 사이드바 링크는 제거됨(접수는 헤더 패널이 주 진입) — 라우트는 딥링크 대비로 유지.
export function Checkin() {
  return (
    <div className="mx-auto max-w-xl px-6 py-8">
      <CheckinForm />
      <p className="mt-6 text-center text-xs text-muted-foreground">데모 화면입니다 · 카메라 대신 '샘플 QR 인식'으로 시연</p>
    </div>
  )
}
