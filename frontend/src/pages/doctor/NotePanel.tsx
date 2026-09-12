import { NoteSection } from '../patient/NoteSection'
import type { PatientNote } from '../../api/patients'
import type { SectionState } from '../patient/format'

// [DOCTOR-NOTE-01~03][AD-063] 환자별 내부 메모 — /patients/:id와 **같은 저장소·같은 부품**을 쓴다.
//   두 화면이 같은 메모를 본다는 계약을 코드로도 하나로 지킨다: 진료 콘솔은 patient 화면의 NoteSection을
//   그대로 얹는다(자유 텍스트만·본인 작성자·수정/삭제 버튼 없음은 그 컴포넌트가 이미 지킨다).

interface NotePanelProps {
  state: SectionState<PatientNote[]>
  onAdd: (content: string) => Promise<void>
}

export function NotePanel({ state, onAdd }: NotePanelProps) {
  return <NoteSection state={state} onAdd={onAdd} />
}
