import { patients } from '@/mock/data'
import type { Patient } from '@/mock/types'

export type FamilyGender = 'F' | 'M'
export type FamilySource = 'self' | 'new' | 'existing'

export type FamilyMember = {
  id: string
  name: string
  birthDate: string
  gender: FamilyGender
  relation: string
  phone?: string
  source: FamilySource
  isActive: boolean
  canEditIdentity: boolean
  identityLockReason?: string
}

type PatientDetails = Pick<FamilyMember, 'birthDate' | 'gender' | 'phone'>

// 공용 patients에는 데모 예약에 필요한 최소 필드만 있으므로 가족 화면의 표시 정보는
// 이 폴더에서 확장한다. 실제 환자 데이터나 공용 mock은 수정하지 않는다.
const patientDetails: Record<string, PatientDetails> = {
  'p-self': { birthDate: '1948-04-12', gender: 'F', phone: '010-1111-2222' },
  'p-mom': { birthDate: '1952-09-08', gender: 'F', phone: '010-5555-1212' },
  'p-son': { birthDate: '2010-01-15', gender: 'M' },
}

function detailsFor(patient: Patient): PatientDetails {
  return patientDetails[patient.id] ?? { birthDate: '1990-01-01', gender: 'F' }
}

const selfPatient = patients.find((patient) => patient.relation === '본인') ?? patients[0]
const selfDetails = detailsFor(selfPatient)

export const currentPatient: FamilyMember = {
  id: selfPatient.id,
  name: selfPatient.name,
  birthDate: selfDetails.birthDate,
  gender: selfDetails.gender,
  relation: '본인',
  phone: selfDetails.phone,
  source: 'self',
  isActive: true,
  canEditIdentity: true,
}

/** 가족 목록에는 본인을 중복해서 넣지 않는다. 본인 카드는 목록 화면에서 맨 위에 별도로 보인다. */
export const initialFamilyMembers: FamilyMember[] = patients
  .filter((patient) => patient.relation !== '본인')
  .map((patient) => {
    const details = detailsFor(patient)
    return {
      id: patient.id,
      name: patient.name,
      birthDate: details.birthDate,
      gender: details.gender,
      relation: patient.relation,
      phone: details.phone,
      // 기존 병원 환자로 연결된 가족은 기본정보를 병원에 문의해 수정한다.
      source: patient.id === 'p-mom' ? 'existing' : 'new',
      isActive: true,
      canEditIdentity: patient.id !== 'p-mom',
      identityLockReason:
        patient.id === 'p-mom' ? '병원에 문의하시면 수정해 드립니다' : undefined,
    }
  })

// 화면/테스트에서 읽기 좋은 이름도 함께 제공한다.
export const familyMembers = initialFamilyMembers

export const relationOptions = ['아들', '딸', '배우자', '부모'] as const

export function genderLabel(gender: FamilyGender): string {
  return gender === 'M' ? '남' : '여'
}

export function formatBirthDate(birthDate: string): string {
  const [year, month, day] = birthDate.split('-')
  return `${year}.${month}.${day}`
}
