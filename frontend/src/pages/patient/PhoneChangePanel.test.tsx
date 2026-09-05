import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, describe, expect, test, vi } from 'vitest'
import { PhoneChangePanel } from './PhoneChangePanel'

// jsdom엔 scrollIntoView가 없다 — InlineError가 자리로 스크롤하려다 죽지 않게 스텁한다.
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn()
})

describe('PhoneChangePanel', () => {
  test('[PTDET-ACTION-02] 인증을 거치고, 한 번에 저장하지 않는다', async () => {
    const user = userEvent.setup()
    const onRequestCode = vi.fn(async () => {})
    const onConfirm = vi.fn(async () => {})
    const onDone = vi.fn()
    render(<PhoneChangePanel currentPhone="010-0000-5678" onRequestCode={onRequestCode} onConfirm={onConfirm} onDone={onDone} />)

    await user.type(screen.getByLabelText('새 전화번호'), '010-9999-8888')
    await user.click(screen.getByRole('button', { name: '다음' }))

    expect(await screen.findByLabelText('인증번호')).toBeVisible()
    expect(onRequestCode).toHaveBeenCalledWith('010-9999-8888')
    // 인증 전에는 확정(onConfirm)이 일어나지 않는다 — 한 번에 저장하지 않는다.
    expect(onConfirm).not.toHaveBeenCalled()
  })

  test('[PTDET-ACTION-03] 인증 실패면 성공한 척하지 않고 원인·다시 받기를 패널에 남긴다', async () => {
    const user = userEvent.setup()
    const onRequestCode = vi.fn(async () => {})
    const onConfirm = vi.fn(async () => {
      throw new Error('인증번호가 올바르지 않습니다.')
    })
    const onDone = vi.fn()
    render(<PhoneChangePanel currentPhone="010-0000-5678" onRequestCode={onRequestCode} onConfirm={onConfirm} onDone={onDone} />)

    await user.type(screen.getByLabelText('새 전화번호'), '010-9999-8888')
    await user.click(screen.getByRole('button', { name: '다음' }))
    await screen.findByLabelText('인증번호')
    await user.type(screen.getByLabelText('인증번호'), '000000')
    await user.click(screen.getByRole('button', { name: '확인' }))

    // 실패 원인은 패널 안에, 성공(onDone)은 일어나지 않는다.
    expect(await screen.findByRole('alert')).toHaveTextContent('인증번호가 올바르지 않습니다.')
    expect(onDone).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '다시 받기' })).toBeVisible()
  })

  test('[PTDET-ACTION-03] 인증번호 발송이 막히면(창구 준비 중) 조용히 멈추지 않고 원인을 보인다', async () => {
    const user = userEvent.setup()
    // OTP 발송 창구가 아직 없어 거절되는 상황(갭 #19). [다음]이 예외를 삼켜 조용한 먹통이 되면 안 된다.
    const onRequestCode = vi.fn(async () => {
      throw new Error('본인확인(OTP) 창구가 아직 열리지 않았습니다.')
    })
    const onConfirm = vi.fn(async () => {})
    render(<PhoneChangePanel currentPhone="010-0000-5678" onRequestCode={onRequestCode} onConfirm={onConfirm} onDone={vi.fn()} />)

    await user.type(screen.getByLabelText('새 전화번호'), '010-9999-8888')
    await user.click(screen.getByRole('button', { name: '다음' }))

    // 원인은 패널 안에, 인증번호 단계로는 넘어가지 않는다(발송이 안 됐으니).
    expect(await screen.findByRole('alert')).toHaveTextContent('본인확인(OTP) 창구가 아직 열리지 않았습니다.')
    expect(screen.queryByLabelText('인증번호')).toBeNull()
  })

  test('[PTDET-ACTION-02] 새 번호가 비면 다음으로 넘어가지 않는다', async () => {
    const user = userEvent.setup()
    const onRequestCode = vi.fn(async () => {})
    render(<PhoneChangePanel currentPhone="010-0000-5678" onRequestCode={onRequestCode} onConfirm={vi.fn()} onDone={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: '다음' }))
    await waitFor(() => expect(screen.getByRole('alert')).toBeVisible())
    expect(onRequestCode).not.toHaveBeenCalled()
    expect(screen.queryByLabelText('인증번호')).toBeNull()
  })
})
