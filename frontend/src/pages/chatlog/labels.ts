import type { Channel, RouteTaken } from '../../api/staffChatLog'

// 채널·갈래를 사람 말로. 계약 밖 값(EXC-01)은 이 맵에 없으므로 원문 문자열을 그대로 보여준다.
export const CHANNEL_LABEL: Record<Channel, string> = { app: '앱', web: '웹' }

// route_taken 5값(Task 5 서버 enum)을 그대로 살린다 — 데모의 3그룹 뭉갬보다 규칙이 정확(플랜 우선).
export const ROUTE_LABEL: Record<RouteTaken, string> = {
  emergency: '긴급',
  rag: '자료 안내',
  department_guide: '진료과 안내',
  agent: '예약 처리',
  handoff: '직원 연결',
}

// 갈래별 색점 — 목록·필터가 같은 뜻으로 읽히게(구조가 정보다, 데모 ROUTE_DOT 계승).
export const ROUTE_DOT: Record<RouteTaken, string> = {
  emergency: '#C0392B', // 적색(긴급 규칙기반)
  rag: '#0B6E70', // 딥틸(자료로 스스로 답)
  department_guide: '#1D6FB8', // 파랑(진료과 안내)
  agent: '#6D4F9B', // 보라(예약 처리)
  handoff: '#B45309', // 앰버(사람에게 넘어감)
}

// 계약 밖 값은 원문 그대로(치환·발명 금지, EXC-01).
export const channelText = (c: string): string => CHANNEL_LABEL[c as Channel] ?? c
export const routeText = (r: string): string => ROUTE_LABEL[r as RouteTaken] ?? r
export const routeDot = (r: string): string | undefined => ROUTE_DOT[r as RouteTaken]
