/// 진행률 문구 한 곳 — 숫자는 서버(compute_progress) 한 곳에서 오고, 글자는 여기 한 곳에서 만든다.
/// QNR-PROG-09: 마법사 상단·이어쓰기·홈 줄이 같은 값을 쓴다. 각 화면이 제 손으로 만들지 않는다.
library;

/// QNR-PROG-06: 마법사 상단 「3번 / 8문항」. index는 0부터 세는 자리, 사람에게는 1부터 보인다.
String qnrHeaderText({required int index, required int total}) => '${index + 1}번 / $total문항';

/// QNR-PROG-08: 이어쓰기 「8문항 중 3개를 작성하셨습니다.」 — 「한 것」의 수(알림만 「남은 수」, QNR-PROG-10).
String qnrResumeText({required int answered, required int total}) => '$total문항 중 $answered개를 작성하셨습니다.';

/// QNR-PROG-07: 홈·나의 예약 줄 「사전문진 작성 중 (3/8)」. 뒤의 `· 이어서 쓰기 ›`는 줄 위젯이 붙인다.
String qnrRowText({required int answered, required int total}) => '사전문진 작성 중 ($answered/$total)';
