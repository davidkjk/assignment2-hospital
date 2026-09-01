export type LauncherProps = { open: boolean; hasUnread: boolean; onOpen: () => void; onClose: () => void };

export function Launcher({ open, hasUnread, onOpen }: LauncherProps) {
  return (
    <div aria-label="AI 상담봇 런처" data-open={open ? 'true' : 'false'}>
      {!open && (
        <button type="button" aria-label="AI 상담봇 열기" onClick={onOpen}>
          AI 상담봇
          {hasUnread && <span aria-label="새 답변 있음" role="img">●</span>}
        </button>
      )}
    </div>
  );
}
