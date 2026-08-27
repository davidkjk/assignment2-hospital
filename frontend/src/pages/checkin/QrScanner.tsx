import { useEffect, useRef, type CSSProperties } from 'react'

// [CHKIN-SCAN-01~05] 카메라는 부모가 이 컴포넌트를 마운트한 뒤에만 켜지고(버튼을 눌러야 마운트된다),
// 첫 인식 뒤 부모가 걷어 내며 멈춘다. html5-qrcode는 초당 여러 프레임을 콜백하므로 scannedRef가
// 없으면 조회가 여러 번 간다(CHKIN-SCAN-03).
//
// ⭐ 카메라·디코더는 jsdom이 만들 수 없다. 그래서 「스캐너를 만드는 일」을 factory 경계 뒤로 밀어,
//    테스트는 가짜 컨트롤러를 주입하고 실물은 html5-qrcode를 쓴다(브리프·plan Step 10).

export interface QrScanController {
  start(onDecode: (text: string) => void): Promise<void>
  stop(): Promise<void>
}

export type QrScannerFactory = (elementId: string) => QrScanController

// 실물 경계 — html5-qrcode를 감싼다. 프레임마다 못 읽는 것은 정상이라 오류로 올리지 않는다.
export function defaultScannerFactory(elementId: string): QrScanController {
  let instance: import('html5-qrcode').Html5Qrcode | null = null
  return {
    async start(onDecode) {
      const { Html5Qrcode } = await import('html5-qrcode')
      instance = new Html5Qrcode(elementId)
      await instance.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: 250 },
        (text) => onDecode(text),
        () => {},
      )
    },
    async stop() {
      try {
        await instance?.stop()
      } catch {
        /* 이미 멈췄거나 못 켜진 경우 — 조용히 넘긴다. */
      }
    },
  }
}

export function QrScanner({
  onDecoded,
  onError,
  factory = defaultScannerFactory,
}: {
  onDecoded: (text: string) => void
  onError: (message: string) => void
  factory?: QrScannerFactory
}) {
  const containerId = useRef(`qr-${Math.random().toString(36).slice(2)}`)
  const scannedRef = useRef(false)
  const onDecodedRef = useRef(onDecoded)
  const onErrorRef = useRef(onError)
  onDecodedRef.current = onDecoded
  onErrorRef.current = onError

  useEffect(() => {
    const controller = factory(containerId.current)
    let cancelled = false
    controller
      .start((text) => {
        if (scannedRef.current) return // CHKIN-SCAN-03 — 첫 프레임만 쓴다
        scannedRef.current = true
        onDecodedRef.current(text) // 멈추는 것은 부모가 이 컴포넌트를 걷어 내며 한다(CHKIN-SCAN-02)
      })
      .catch(() => {
        if (!cancelled) onErrorRef.current('카메라를 시작할 수 없습니다. 카메라 권한을 확인해주세요')
      })
    return () => {
      cancelled = true
      void controller.stop()
    }
    // factory는 마운트당 한 번만 잡는다 — 콜백은 ref로 최신을 읽으므로 재구독하지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <div id={containerId.current} aria-label="QR 스캐너" style={styles.frame} />
}

const styles: Record<string, CSSProperties> = {
  frame: {
    width: '100%',
    minHeight: 220,
    borderRadius: 'var(--radius-card)',
    border: '1px solid var(--color-divider)',
    background: 'var(--color-bg)',
    overflow: 'hidden',
  },
}
