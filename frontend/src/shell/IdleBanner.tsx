export function IdleBanner({ onContinue }: { onContinue: () => void }) {
  return <div role="alert" style={{ padding: 'var(--sp-3) var(--sp-5)', background: 'var(--color-done-bg)', color: 'var(--color-warn)', display: 'flex', justifyContent: 'center', gap: 'var(--sp-4)', alignItems: 'center' }}><strong>3분 뒤 자동으로 로그아웃됩니다</strong><button onClick={onContinue}>계속 쓰기</button></div>
}
