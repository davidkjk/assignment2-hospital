import { render, waitFor } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { QrScanner, type QrScanController } from './QrScanner'

// QrScanner는 카메라·디코더를 factory 경계 뒤에 둔다 — 여기서는 가짜 컨트롤러로 스캐너 규칙만 본다.
function fakeFactory(hooks: { onStart?: (emit: (t: string) => void) => void; fail?: boolean; onStop?: () => void }) {
  return (): QrScanController => ({
    async start(onDecode) {
      if (hooks.fail) throw new Error('no-camera')
      hooks.onStart?.(onDecode)
    },
    async stop() { hooks.onStop?.() },
  })
}

describe('QrScanner', () => {
  test('[CHKIN-SCAN-03] 같은 프레임이 여러 번 들어와도 첫 번만 부모에게 올린다', async () => {
    let emit: ((t: string) => void) | null = null
    const onDecoded = vi.fn()
    render(<QrScanner onDecoded={onDecoded} onError={() => {}} factory={fakeFactory({ onStart: (e) => { emit = e } })} />)
    await waitFor(() => expect(emit).not.toBeNull())
    emit!('AB34CD'); emit!('AB34CD'); emit!('AB34CD')
    expect(onDecoded).toHaveBeenCalledTimes(1)
  })

  test('[CHKIN-SCAN-02] 디코드한 문자열을 그대로 부모에게 넘긴다(정규화는 부모의 몫)', async () => {
    let emit: ((t: string) => void) | null = null
    const onDecoded = vi.fn()
    render(<QrScanner onDecoded={onDecoded} onError={() => {}} factory={fakeFactory({ onStart: (e) => { emit = e } })} />)
    await waitFor(() => expect(emit).not.toBeNull())
    emit!('  ab34cd\n')
    expect(onDecoded).toHaveBeenCalledWith('  ab34cd\n')
  })

  test('[CHKIN-SCAN-04] 카메라 시작이 실패하면 사용자 문구로 onError를 부른다', async () => {
    const onError = vi.fn()
    render(<QrScanner onDecoded={() => {}} onError={onError} factory={fakeFactory({ fail: true })} />)
    await waitFor(() => expect(onError).toHaveBeenCalledWith('카메라를 시작할 수 없습니다. 카메라 권한을 확인해주세요'))
  })

  test('[CHKIN-SCAN-05] 언마운트되면 카메라를 멈춘다', async () => {
    const onStop = vi.fn()
    const { unmount } = render(<QrScanner onDecoded={() => {}} onError={() => {}} factory={fakeFactory({ onStart: () => {}, onStop })} />)
    unmount()
    await waitFor(() => expect(onStop).toHaveBeenCalled())
  })
})
