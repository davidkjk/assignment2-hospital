import { useEffect, useState } from 'react'
import { QrCode, X } from '@/components/icons'
import { CheckinForm } from './CheckinForm'

// 헤더 [QR 접수] → 오른쪽 슬라이드 패널(SHELL-ACT-04: 화면 안 옮기고 패널만).
// 접수는 창구에서 '빈손으로 시작'하는 도착 접수 도구라 새 예약·당일 방문과 같은 헤더 묶음.
// 뒤 화면은 백드롭으로 읽기전용(PANEL-BACK-01).
export function CheckinPanel({ onClose }: { onClose: () => void }) {
  const [shown, setShown] = useState(false)
  useEffect(() => setShown(true), [])
  const close = () => {
    setShown(false)
    window.setTimeout(onClose, 200)
  }

  return (
    <div className="fixed inset-0 z-50">
      <div
        onClick={close}
        className={`absolute inset-0 bg-black/20 transition-opacity duration-200 motion-reduce:transition-none ${
          shown ? 'opacity-100' : 'opacity-0'
        }`}
      />
      <aside
        className={`absolute right-0 top-0 flex h-full w-[360px] max-w-[90vw] flex-col bg-background shadow-[-4px_0_24px_rgba(16,45,50,0.12)] transition-transform duration-200 motion-reduce:transition-none ${
          shown ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-5">
          <div className="flex items-center gap-2">
            <QrCode className="h-5 w-5 text-primary" />
            <h2 className="text-base font-semibold">QR·예약번호 접수</h2>
          </div>
          <button onClick={close} aria-label="닫기" className="rounded-full p-1 hover:bg-muted">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <CheckinForm onClose={close} />
          <p className="mt-6 text-center text-xs text-muted-foreground">데모 화면입니다 · 카메라 대신 '샘플 QR 인식'으로 시연</p>
        </div>
      </aside>
    </div>
  )
}
