import { useNavigate } from 'react-router-dom'
import { X } from 'lucide-react'
import { PhoneFrame } from '@/components/PhoneFrame'

// 정본: QR 전체화면(NAV-HOME-02). 데모라 실제 QR 대신 자리표시 격자.
// 밝기 원복 등 엣지 규칙은 범위 밖.
export function QrFullscreen() {
  const navigate = useNavigate()
  return (
    <PhoneFrame>
      <div
        data-testid="qr-screen"
        className="flex h-full flex-col items-center justify-center gap-8 bg-white p-8"
      >
        <button
          aria-label="닫기"
          className="absolute right-4 top-4 rounded-full bg-neutral-100 p-2"
          onClick={() => navigate(-1)}
        >
          <X className="h-5 w-5" />
        </button>

        <p className="text-sm text-muted-foreground">접수 데스크에 보여주세요</p>
        <div className="grid h-56 w-56 grid-cols-8 grid-rows-8 gap-0.5 rounded-lg border-4 border-neutral-900 p-2">
          {Array.from({ length: 64 }).map((_, i) => (
            <div
              key={i}
              className={(i * 7 + 3) % 3 === 0 ? 'bg-neutral-900' : 'bg-transparent'}
            />
          ))}
        </div>
        <p className="text-lg font-bold">김순자 · 내과 이정훈</p>
      </div>
    </PhoneFrame>
  )
}
