export function IdleBanner({ onContinue }: { onContinue: () => void }) {
  return <div role="alert" style={{ padding: '10px 18px', background: 'var(--color-done-bg)', color: 'var(--color-warn)', display: 'flex', justifyContent: 'center', gap: 14, alignItems: 'center' }}><strong>3분 뒤 자동으로 로그아웃됩니다</strong><button onClick={onContinue}>계속 쓰기</button></div>
}
