// 대본형 상담봇의 데이터 모델.
// 실제 LLM 없이, "노드(대화 한 마디) 그래프"를 미리 짜두고 환자가 칩을 누르면
// 다음 노드로 이동하며 재생한다. 같은 엔진이 ① 앱 AI 상담 탭 ② 예약 진료과 시트
// ③ 병원 홈페이지 웹 위젯 세 곳에 올라탄다(요구사항 5.1).

export type NodeId = string

/** 답변 근거 머리말(요구사항 5.6 — 무엇을 근거로 답했는지 보인다). */
export type SourceTag = '진료 안내' | '병원 이용 안내'

export type BotBubble = {
  text: string
  /** 있으면 풍선 위에 작은 근거 머리말을 붙인다. */
  source?: SourceTag
}

/** 봇이 내미는 특수 카드. 일반 말풍선보다 테두리·배경으로 도드라진다. */
export type BotCard =
  // 긴급(119) — 예약을 멈추고 응급 안내(요구사항 5.3)
  | { kind: 'urgent' }
  // 상담 중 예약 제안 — 마지막에 한 번 더 보여주고 눌러야 예약(요구사항 5.4)
  | {
      kind: 'booking'
      who: string
      deptName: string
      doctorName: string
      when: string
      confirmTo: NodeId
    }
  // 예약 완료 — 예약번호 + 사전문진으로 이동
  | { kind: 'booked'; bookingNo: string }
  // 직원 연결 — 처음부터 다시 설명하지 않도록 요약을 함께 인계(요구사항 5.5)
  | { kind: 'handoff'; summary: { label: string; value: string }[]; hours: 'in' | 'out' }
  // 예약 진료과 시트 전용 — 유일한 출구 `○○과로 계속하기`(정본 BOOK-BOT-07)
  | { kind: 'deptResult'; deptId: string; deptName: string }
  // 웹(익명) 전용 — 예약은 로그인 필요 행동. 버튼을 누르면 위젯 위에 인증 모달을 띄우고
  // (정본 WEBMOD-AUTH-01), 로그인 성공 후 resumeTo 노드(예약 확인)로 복귀한다(WEBMOD-AUTH-07).
  | { kind: 'bookingAuth'; deptName: string; resumeTo: NodeId }

export type QuickReply = { label: string; to: NodeId }

export type BotNode = {
  id: NodeId
  /** 이 노드에 들어오면 순서대로 재생할 봇 말풍선(사이에 "입력 중" 표시). */
  bot?: BotBubble[]
  /** 말풍선 뒤에 내밀 카드. */
  card?: BotCard
  /** 카드/말풍선 뒤에 보일 답변 선택 칩. */
  options?: QuickReply[]
  /** 더 이어질 게 없는 마무리 노드(칩도 없음). */
  end?: boolean
}

export type BotScript = {
  startId: NodeId
  nodes: Record<NodeId, BotNode>
}
