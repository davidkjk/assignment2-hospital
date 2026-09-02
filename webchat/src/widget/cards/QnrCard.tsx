import type { CardProps } from './WebCard';

// ── WEBCARD-QNR ── 웹엔 문진 화면이 없다. 앱 경로만 안내. 내용·진행률 노출 금지(로그인 무관).
export function QnrCard({ p }: CardProps) {
  if ((p.total as number | undefined) === 0)
    return <p>작성할 문진이 없습니다</p>; // 0문항: 한 줄. 버튼·(0/0)·독립 카드 없음
  return (
    <div>
      <p>사전문진은 환자 앱에서 작성하거나 수정할 수 있습니다</p>
      <p>환자 앱에서 확인해 주세요</p>
      {/* 특정 예약의 문항·답변·진행률을 조회·노출하지 않고, 웹 문진 열기 흐름으로 보내지 않는다 */}
    </div>
  );
}
