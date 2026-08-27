import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'
import { resolveEarlier, WalkinVisitTimePicker } from './WalkinVisitTimePicker'

const BASE = new Date('2026-08-26T13:00:00') // 오늘 13:00 기준(로컬)

describe('resolveEarlier (QUEUE-WALK-14b·14c·14d·14e·16)', () => {
  test('QUEUE-WALK-14b: 4자리 1015 → 10:15', () => {
    const r = resolveEarlier('1015', BASE)
    expect(r.error).toBeNull()
    expect(new Date(r.iso!).getHours()).toBe(10)
    expect(new Date(r.iso!).getMinutes()).toBe(15)
  })

  test('QUEUE-WALK-14c: 3자리 905 → 09:05', () => {
    const r = resolveEarlier('905', BASE)
    expect(new Date(r.iso!).getHours()).toBe(9)
    expect(new Date(r.iso!).getMinutes()).toBe(5)
  })

  test('QUEUE-WALK-14d: 10:07은 5분 격자로 스냅하지 않는다', () => {
    const r = resolveEarlier('1007', BASE)
    expect(new Date(r.iso!).getMinutes()).toBe(7)
  })

  test('QUEUE-WALK-16: 미래 시각은 iso 없이 「아직 오지 않은 시각입니다」', () => {
    const r = resolveEarlier('1400', BASE) // 지금은 13:00
    expect(r.iso).toBeNull()
    expect(r.error).toBe('아직 오지 않은 시각입니다.')
  })
})

describe('WalkinVisitTimePicker', () => {
  test('기본은 「지금」 — 방문 시각을 따로 남기지 않는다(iso=null)', () => {
    const onChange = vi.fn()
    render(<WalkinVisitTimePicker onChange={onChange} now={BASE} />)
    // 「지난 시각」을 골랐다가 다시 「지금」으로.
    expect(screen.getByLabelText('지금', { selector: 'input' }) ?? screen.getByRole('radio', { name: /지금/ })).toBeTruthy()
  })

  test('QUEUE-WALK-14e: 미래를 치면 그 자리에서 알리고 입력을 지우지 않는다', async () => {
    const onChange = vi.fn()
    render(<WalkinVisitTimePicker onChange={onChange} now={BASE} />)
    await userEvent.click(screen.getByRole('radio', { name: /지난 시각/ }))
    const input = screen.getByLabelText('오신 시각(오늘)')
    await userEvent.type(input, '1400')
    expect(await screen.findByRole('alert')).toHaveTextContent('아직 오지 않은 시각입니다')
    expect(input).toHaveValue('1400') // 입력을 지우지 않는다
    expect(onChange).toHaveBeenLastCalledWith({ iso: null, error: '아직 오지 않은 시각입니다.' })
  })

  test('올바른 지난 시각은 미리보기와 iso를 준다', async () => {
    const onChange = vi.fn()
    render(<WalkinVisitTimePicker onChange={onChange} now={BASE} />)
    await userEvent.click(screen.getByRole('radio', { name: /지난 시각/ }))
    await userEvent.type(screen.getByLabelText('오신 시각(오늘)'), '1015')
    const last = onChange.mock.calls.at(-1)![0]
    expect(last.error).toBeNull()
    expect(last.iso).not.toBeNull()
  })
})
