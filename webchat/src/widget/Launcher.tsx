export type LauncherProps = { open: boolean; hasUnread: boolean; onOpen: () => void; onClose: () => void };

export function Launcher({ open, hasUnread, onOpen }: LauncherProps) {
  // 단독 배포 시 우하단 진입 버튼. 홈페이지 임베드에선 홈페이지 런처가 열기를 맡고 이 iframe은 숨겨진다.
  return (
    <div className="wc-launcher" aria-label="AI 상담봇 런처" data-open={open ? 'true' : 'false'}>
      {!open && (
        <button type="button" className="wc-launcher__btn" aria-label="AI 상담봇 열기" onClick={onOpen}>
          <svg className="wc-launcher__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M21 11.5a8.4 8.4 0 0 1-11.9 7.6L3 21l1.9-6.1A8.4 8.4 0 1 1 21 11.5Z" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="wc-launcher__label">AI 상담봇</span>
          {hasUnread && <span className="wc-launcher__dot" aria-label="새 답변 있음" role="img" />}
        </button>
      )}
    </div>
  );
}
