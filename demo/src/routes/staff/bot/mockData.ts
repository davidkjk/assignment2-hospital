// 승인은 편집기에서 바로 한다 → 별도 「승인 대기」 상태는 두지 않는다(저장했지만 미승인 = 임시저장)
export type KnowledgeStatus = '승인됨' | '임시저장'

export type KnowledgeItem = {
  id: string
  title: string
  category: '위치·주차' | '예약·변경·취소 규칙' | '검사 전 준비사항' | '자주 묻는 질문'
  status: KnowledgeStatus
  updatedAt: string
  body: string
  restricted?: boolean
}

export const knowledgeItems: KnowledgeItem[] = [
  {
    id: 'kb-101',
    title: '지하 주차장 이용 안내',
    category: '위치·주차',
    status: '승인됨',
    updatedAt: '2026-08-22 09:40',
    body: '병원 건물 지하 1~3층 주차장을 이용해 주세요. 진료 환자는 접수 창구에서 2시간 무료 등록을 받을 수 있습니다.',
  },
  {
    id: 'kb-102',
    title: '예약 변경과 취소 상담 안내',
    category: '예약·변경·취소 규칙',
    status: '임시저장',
    updatedAt: '2026-08-21 16:10',
    body: '예약 변경이나 취소가 필요하면 상담(직원 확인)으로 연결합니다. 연결 후에는 직원 확인 중으로 안내합니다.',
  },
  {
    id: 'kb-103',
    title: '위내시경 검사 전 준비',
    category: '검사 전 준비사항',
    status: '승인됨',
    updatedAt: '2026-08-20 14:25',
    body: '검사 전 금식 시간은 예약 안내문을 확인해 주세요. 복용 중인 약이 있다면 병원에 미리 알려 주세요.',
  },
  {
    id: 'kb-104',
    title: '증명서 발급 위치',
    category: '자주 묻는 질문',
    status: '임시저장',
    updatedAt: '2026-08-19 11:05',
    body: '제증명 창구는 본관 1층 원무과 옆에 있습니다.',
  },
  { id: 'kb-105', title: '초진 접수와 진료 의뢰서 안내', category: '자주 묻는 질문', status: '승인됨', updatedAt: '2026-08-18 13:20', body: '처음 오시는 분은 신분증을 지참해 접수 창구에서 초진 접수를 해 주세요. 타 병원 진료 의뢰서가 있으면 함께 제출해 주세요.' },
  { id: 'kb-106', title: 'MRI 검사 전 금속 제거 안내', category: '검사 전 준비사항', status: '임시저장', updatedAt: '2026-08-17 10:05', body: '금속이 포함된 물품(시계·귀걸이·보청기 등)은 검사 전 모두 제거해야 합니다. 체내 금속 삽입물이 있으면 미리 알려 주세요.' },
  { id: 'kb-107', title: '예약 부도(노쇼) 시 안내', category: '예약·변경·취소 규칙', status: '임시저장', updatedAt: '2026-08-16 17:40', body: '예약 시간에 오지 못하면 미리 취소해 주세요. 반복되면 예약이 제한될 수 있습니다.' },
  { id: 'kb-108', title: '대중교통·셔틀버스 안내', category: '위치·주차', status: '승인됨', updatedAt: '2026-08-15 09:12', body: '지하철 3호선 병원역 2번 출구에서 도보 5분입니다. 정문 셔틀버스는 30분 간격으로 운행합니다.' },
  { id: 'kb-109', title: '진단서·소견서 발급 비용', category: '자주 묻는 질문', status: '승인됨', updatedAt: '2026-08-14 11:30', body: '제증명 발급 비용은 종류에 따라 다릅니다. 정확한 금액은 원무과에서 확인하도록 안내합니다.', restricted: true },
]

export const knowledgeHistory = [
  { id: 'h3', version: 'v3', by: '김서현 관리자', at: '2026-08-22 09:40', change: '무료 주차 시간을 2시간으로 수정', body: knowledgeItems[0].body },
  { id: 'h2', version: 'v2', by: '이도윤 관리자', at: '2026-08-14 15:12', change: '주차 등록 장소를 명확히 표기', body: '지하 주차장을 이용해 주세요. 접수 창구에서 무료 주차를 등록할 수 있습니다.' },
  { id: 'h1', version: 'v1', by: '김서현 관리자', at: '2026-08-01 10:18', change: '안내자료 최초 작성', body: '병원 건물 지하에 주차장이 있습니다.' },
]

export type UnresolvedCluster = {
  id: string
  question: string
  count: number
  lastAt: string
  examples: string[]
}

export const unresolvedClusters: UnresolvedCluster[] = [
  { id: 'u1', question: '보호자도 검사실에 함께 들어갈 수 있나요?', count: 18, lastAt: '오늘 10:32', examples: ['아이 검사 때 보호자가 같이 들어가도 되나요?', '검사실에 가족이 동행할 수 있나요?', '보호자 한 명은 검사실 입장이 가능한가요?'] },
  { id: 'u2', question: '휠체어는 어디에서 빌릴 수 있나요?', count: 12, lastAt: '오늘 09:18', examples: ['입구에서 휠체어 대여가 되나요?', '휠체어 빌리는 곳이 어디예요?', '주차장에서 휠체어를 쓸 수 있나요?'] },
  { id: 'u3', question: '검사 결과지를 이메일로 받을 수 있나요?', count: 7, lastAt: '어제 17:41', examples: ['결과를 메일로 보내주시나요?', '검사 결과 PDF를 받을 수 있나요?', '방문하지 않고 결과지를 받을 방법이 있나요?'] },
  { id: 'u4', question: '진료 예약 없이 방문해도 되나요?', count: 15, lastAt: '오늘 11:05', examples: ['예약 안 하고 그냥 가도 되나요?', '당일 접수도 가능한가요?', '워크인 진료가 되나요?'] },
  { id: 'u5', question: '실손보험 청구 서류는 무엇이 필요한가요?', count: 9, lastAt: '어제 14:22', examples: ['보험 청구하려면 어떤 서류가 필요해요?', '실비 청구 서류 떼려면요?', '진료비 세부내역서도 주시나요?'] },
  { id: 'u6', question: '외국어 통역 지원이 되나요?', count: 4, lastAt: '2일 전 10:11', examples: ['영어 상담 가능한가요?', '통역 서비스가 있나요?'] },
]

export type ReportSource = 'realtime_report' | 'quality_review'
export type ReportStatus = '처리 전' | '처리 중' | '처리 완료'

export type WrongAnswerReport = {
  id: string
  source: ReportSource
  question: string
  answer: string
  correction: string
  evidence: string
  status: ReportStatus
  reportedAt: string
}

export const wrongAnswerReports: WrongAnswerReport[] = [
  { id: 'r1', source: 'realtime_report', question: '토요일에도 채혈실을 이용할 수 있나요?', answer: '토요일에는 오후 1시까지 이용할 수 있습니다.', correction: '토요일 채혈실 운영 여부는 검사실에 확인하도록 안내해야 합니다.', evidence: '사용한 병원 안내 없음', status: '처리 전', reportedAt: '오늘 10:12' },
  { id: 'r2', source: 'quality_review', question: '주차 등록은 어디서 하나요?', answer: '무인정산기에서 차량을 등록해 주세요.', correction: '진료 환자는 접수 창구에서 차량 번호를 등록합니다.', evidence: '지하 주차장 이용 안내 v2', status: '처리 전', reportedAt: '어제 16:45' },
  { id: 'r3', source: 'realtime_report', question: '예약 시간을 바꾸고 싶어요.', answer: '예약 변경 요청을 접수했습니다.', correction: '예약 변경은 상담(직원 확인)으로 연결하고 직원 확인 중이라고 안내합니다.', evidence: '예약 변경과 취소 상담 안내', status: '처리 완료', reportedAt: '08-20 14:21' },
  { id: 'r4', source: 'quality_review', question: '건강검진 결과는 언제 나오나요?', answer: '검진 당일 바로 결과를 받을 수 있습니다.', correction: '검진 항목에 따라 결과 시점이 다르므로 검진센터에 확인하도록 안내합니다.', evidence: '사용한 병원 안내 없음', status: '처리 중', reportedAt: '오늘 09:40' },
  { id: 'r5', source: 'realtime_report', question: '아이 예방접종도 하나요?', answer: '모든 예방접종이 가능합니다.', correction: '접종 가능 항목은 진료과·시기에 따라 다르므로 소아과에 확인하도록 안내합니다.', evidence: '사용한 병원 안내 없음', status: '처리 전', reportedAt: '어제 13:02' },
  { id: 'r6', source: 'quality_review', question: '진료비 카드 할부가 되나요?', answer: '할부는 불가능합니다.', correction: '수납 관련 문의는 원무과로 연결해 안내합니다.', evidence: '사용한 병원 안내 없음', status: '처리 완료', reportedAt: '08-19 15:33' },
]

export type QualityConversation = {
  id: string
  at: string
  question: string
  channel: '앱' | '웹'
  grounded: boolean
  reported: boolean
  reviewStatus: '미검토' | '검토 완료'
  answer: string
  evidence: string
}

export const qualityConversations: QualityConversation[] = [
  { id: 'q1', at: '08-22 10:12', question: '토요일 채혈실 운영 시간', channel: '웹', grounded: false, reported: true, reviewStatus: '미검토', answer: '토요일에는 오후 1시까지 이용할 수 있습니다.', evidence: '없음' },
  { id: 'q2', at: '08-22 09:36', question: '내시경 전 복용약 문의', channel: '앱', grounded: true, reported: false, reviewStatus: '미검토', answer: '복용 중인 약은 병원에 미리 알려 주세요.', evidence: '위내시경 검사 전 준비 v4' },
  { id: 'q3', at: '08-21 16:04', question: '무료 주차 등록 위치', channel: '웹', grounded: true, reported: false, reviewStatus: '검토 완료', answer: '접수 창구에서 차량 번호를 등록해 주세요.', evidence: '지하 주차장 이용 안내 v3' },
  { id: 'q4', at: '08-21 11:20', question: '주차 요금 정산 방법', channel: '앱', grounded: true, reported: false, reviewStatus: '검토 완료', answer: '접수 창구에서 무료 등록 후 출차 시 정산하시면 됩니다.', evidence: '지하 주차장 이용 안내 v3' },
  { id: 'q5', at: '08-21 09:50', question: '소아과 진료 시간', channel: '웹', grounded: false, reported: false, reviewStatus: '미검토', answer: '소아과는 평일 오후 6시까지 진료합니다.', evidence: '없음' },
  { id: 'q6', at: '08-20 15:12', question: '진료과를 모를 때 어디로 가야 하나요', channel: '앱', grounded: true, reported: false, reviewStatus: '검토 완료', answer: '증상을 알려주시면 알맞은 진료과를 안내해 드립니다.', evidence: '자주 묻는 질문 v2' },
  { id: 'q7', at: '08-20 10:33', question: '입원 면회 시간', channel: '웹', grounded: false, reported: true, reviewStatus: '미검토', answer: '면회는 언제나 가능합니다.', evidence: '없음' },
]

export const qualityMetrics = [
  { label: '해결률', value: '78.4%', hint: '전주 대비 +2.1%p' },
  { label: '직원 연결률', value: '16.8%', hint: '의료판단·변경 상담 포함' },
  { label: '평균 응답', value: '1.4초', hint: '첫 답변 기준' },
  { label: '오답 신고', value: '9건', hint: '선택 기간' },
]

export type ReferenceExample = {
  id: string
  question: string
  correction: string
  active: boolean
}

export const referenceExamples: ReferenceExample[] = [
  { id: 'e1', question: '예약 시간을 바꾸고 싶어요.', correction: '예약 변경은 상담(직원 확인)으로 연결해 드립니다.', active: true },
  { id: 'e2', question: '내일 휴진인가요?', correction: '휴진 정보는 병원 운영시간 원본에서 확인해 안내합니다.', active: true },
  { id: 'e3', question: '예약을 취소하고 싶어요.', correction: '예약 취소는 상담(직원 확인)으로 연결해 드립니다.', active: true },
  { id: 'e4', question: '진료비가 얼마인가요?', correction: '진료비는 진료 내용에 따라 달라 원무과에서 확인하도록 안내합니다.', active: false },
]

export const overviewMetrics = [
  { label: '총 상담', value: '2,486', hint: '선택 기간 전체 문의' },
  { label: 'AI 해결', value: '1,949', hint: '전체의 78.4%' },
  { label: '직원 연결', value: '417', hint: '전체의 16.8%' },
  { label: '미해결', value: '120', hint: '전체의 4.8%' },
]

export const topQuestions = [
  { id: 't1', question: '주차 등록은 어디서 하나요?', count: 184 },
  { id: 't2', question: '예약 날짜를 바꾸고 싶어요.', count: 151 },
  { id: 't3', question: '건강검진 전 금식은 몇 시간인가요?', count: 126 },
  { id: 't4', question: '병원 위치와 대중교통을 알려 주세요.', count: 98 },
  { id: 't5', question: '진료비 영수증은 어디서 받나요?', count: 73 },
]

export const channelSources = [
  { label: '앱', count: 1328, share: 53 },
  { label: '웹', count: 741, share: 30 },
  { label: '직원', count: 417, share: 17 },
]
