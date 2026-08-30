import { useEffect, useRef, useState, type CSSProperties, type MutableRefObject } from 'react'
import { BusyButton } from '../../../components/BusyButton'
import { ConfirmDialog } from '../../../components/ConfirmDialog'
import { ApiError } from '../../../api/httpClient'
import { staffApi, type ProfilePatch, type StaffMember } from '../../../api/staff'
import { PalettePicker } from './PalettePicker'
import { TextButton } from '@/components/staff-ui'

// [STAFF-PROFILE-01~11·CAL-COLOR-*] 의사 프로필 편집 — 오른쪽 칸을 잠시 빌려 쓴다.
// ⭐ 넷만 고친다: 사진·전문분야·소개글·캘린더 색(이름·역할·소속은 계정 정보라 여기서 안 고침).
// ⭐ 사진 없으면 회색 원 + 이름 첫 글자(BOOK-DOC-05와 같은 그림). 사진 지우기는 확인창 안에서만.
// ⭐ 저장은 바뀐 칸만 보낸다(CAL-COLOR-09는 색값이 아니라 팔레트 번호).

interface Baseline {
  specialty: string
  bio: string
  color: number | null
}

interface DoctorProfilePanelProps {
  doctor: StaffMember
  allStaff: StaffMember[]
  onClose(): void
  onSaved(): void
  onDirtyChange(dirty: boolean): void
  /** 떠날 때 묻기의 [저장]이 부를 수 있게 최신 저장 함수를 심어 둔다(STAFF-PROFILE-09).
   *  실패를 조용히 삼키지 않으려고 성공 여부를 돌려준다 — 실패면 호출부가 떠나지 않는다. */
  saveRef?: MutableRefObject<(() => Promise<boolean>) | null>
}

function baselineOf(doctor: StaffMember): Baseline {
  return { specialty: doctor.specialty ?? '', bio: doctor.bio ?? '', color: doctor.calendar_color_index }
}

export function DoctorProfilePanel({ doctor, allStaff, onClose, onSaved, onDirtyChange, saveRef }: DoctorProfilePanelProps) {
  const [baseline, setBaseline] = useState<Baseline>(() => baselineOf(doctor))
  const [specialty, setSpecialty] = useState(baseline.specialty)
  const [bio, setBio] = useState(baseline.bio)
  const [color, setColor] = useState<number | null>(baseline.color)
  const [photoUrl, setPhotoUrl] = useState<string | null>(doctor.photo_url)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  // 저장했는지 눈에 보이게 한다 — 「눌렀는데 아무 일도 없다」가 이 화면의 원래 증상이었다(L29·L30·G1).
  const [flash, setFlash] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  // 다른 의사로 갈아타면(STAFF-PROFILE-03) 그 사람 값으로 다시 채운다.
  // ⚠️ 저장 성공이 부르는 refetch로도 doctor 참조가 새로 오지만, 그때 flash를 지우면
  //    「저장했습니다」가 바로 사라진다 — flash·오류는 **의사가 실제로 바뀔 때만** 지운다.
  const lastDoctorId = useRef(doctor.id)
  useEffect(() => {
    const b = baselineOf(doctor)
    setBaseline(b)
    setSpecialty(b.specialty)
    setBio(b.bio)
    setColor(b.color)
    setPhotoUrl(doctor.photo_url)
    if (lastDoctorId.current !== doctor.id) {
      setFlash(null)
      setActionError(null)
      lastDoctorId.current = doctor.id
    }
  }, [doctor])

  const dirty = specialty !== baseline.specialty || bio !== baseline.bio || color !== baseline.color

  useEffect(() => {
    onDirtyChange(dirty)
    // 다시 고치기 시작하면 지난 「저장했습니다」를 지운다 — 낡은 성공 표시가 남지 않게.
    if (dirty) setFlash(null)
  }, [dirty, onDirtyChange])

  /** 성공하면 true, 서버가 막으면 false. 실패를 던지지 않고 화면에 이유를 보인다(G1). */
  async function save(): Promise<boolean> {
    const patch: ProfilePatch = {}
    if (specialty !== baseline.specialty) patch.specialty = specialty
    if (bio !== baseline.bio) patch.bio = bio
    if (color !== baseline.color && color !== null) patch.calendar_color_index = color
    setActionError(null)
    try {
      if (Object.keys(patch).length > 0) await staffApi.updateProfile(doctor.id, patch)
    } catch (e) {
      // 서버 실패를 조용히 삼키지 않는다(G1 (c)) — 무동작 대신 이유를 보인다.
      const err = e instanceof ApiError ? e : new ApiError('저장하지 못했습니다. 잠시 후 다시 시도해주세요.', 0)
      setActionError(err.message)
      return false
    }
    setBaseline({ specialty, bio, color })
    setFlash('저장했습니다.')
    onSaved()
    return true
  }

  useEffect(() => {
    if (saveRef) saveRef.current = save
  })

  async function confirmDeletePhoto() {
    setConfirmingDelete(false)
    await staffApi.deletePhoto(doctor.id)
    setPhotoUrl(null)
    onSaved()
  }

  const others = allStaff.filter(
    (m) => m.id !== doctor.id && m.role === 'doctor' && m.is_active && m.calendar_color_index != null,
  )
  const usedIndices = others.map((m) => m.calendar_color_index as number)
  const conflictIndices = others
    .filter((m) => m.department_id === doctor.department_id)
    .map((m) => m.calendar_color_index as number)

  return (
    <aside role="complementary" aria-label="의사 프로필" style={styles.panel}>
      <div style={styles.head}>
        <h2 style={styles.title}>{doctor.name} 선생님 프로필</h2>
        <button type="button" onClick={onClose} style={styles.close}>
          닫기
        </button>
      </div>

      <div data-field="사진" style={styles.field}>
        <span style={styles.fieldLabel}>사진</span>
        <div style={styles.photoRow}>
          <div data-testid="doctor-avatar" style={styles.avatar}>
            {photoUrl ? (
              <img src={photoUrl} alt={`${doctor.name} 사진`} style={styles.avatarImg} />
            ) : (
              <span aria-hidden="true">{doctor.name.slice(0, 1)}</span>
            )}
          </div>
          <div style={styles.photoActions}>
            <label style={styles.uploadBtn}>
              사진 바꾸기
              <input
                type="file"
                accept="image/jpeg,image/png"
                style={{ display: 'none' }}
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  const { photo_url } = await staffApi.uploadPhoto(doctor.id, file)
                  setPhotoUrl(photo_url)
                  onSaved()
                }}
              />
            </label>
            <span style={styles.hint}>JPG·PNG · 5MB까지</span>
            {photoUrl && (
              <TextButton tone="quiet" onClick={() => setConfirmingDelete(true)}>
                사진 지우기
              </TextButton>
            )}
          </div>
        </div>
      </div>

      <label data-field="전문분야" style={styles.field}>
        <span style={styles.fieldLabel}>전문분야</span>
        <input
          type="text"
          aria-label="전문분야"
          value={specialty}
          onChange={(e) => setSpecialty(e.target.value)}
          style={styles.input}
        />
        <span data-help style={styles.help}>
          환자 앱 의사 선택 화면에 그대로 보입니다
        </span>
      </label>

      <label data-field="소개글" style={styles.field}>
        <span style={styles.fieldLabel}>소개글</span>
        <textarea
          aria-label="소개글"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          rows={4}
          style={styles.textarea}
        />
        <span data-help style={styles.help}>
          환자 화면에는 나오지 않습니다 · 상담봇이 답할 때 씁니다
        </span>
      </label>

      <div data-field="캘린더 색" style={styles.field}>
        <span style={styles.fieldLabel}>캘린더 색</span>
        <PalettePicker
          value={color}
          onChange={setColor}
          usedIndices={usedIndices}
          conflictIndices={conflictIndices}
        />
      </div>

      {actionError && (
        <p role="alert" style={styles.alert}>
          {actionError}
        </p>
      )}
      {flash && (
        <p role="status" style={styles.flash}>
          {flash}
        </p>
      )}

      <div style={styles.actions}>
        <BusyButton label="저장" busyLabel="저장하는 중…" onClick={save} />
      </div>

      {confirmingDelete && (
        <ConfirmDialog
          title="사진을 지울까요?"
          message="지우면 회색 원 + 이름 첫 글자로 돌아갑니다. 되살리려면 다시 올려야 합니다."
          confirmLabel="지우기"
          cancelLabel="취소"
          danger
          onConfirm={() => void confirmDeletePhoto()}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </aside>
  )
}

const styles: Record<string, CSSProperties> = {
  panel: { display: 'flex', flexDirection: 'column', gap: 16 },
  head: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  title: { margin: 0, fontSize: 'var(--fs-lg)', fontWeight: 700, color: 'var(--color-ink)' },
  close: {
    height: 30,
    padding: '0 12px',
    borderRadius: 7,
    border: '1px solid var(--color-divider)',
    background: 'var(--color-surface)',
    color: 'var(--color-ink)',
    fontSize: 'var(--fs-sm)',
    fontWeight: 600,
    cursor: 'pointer',
  },
  field: { display: 'flex', flexDirection: 'column', gap: 6 },
  fieldLabel: { fontSize: 'var(--fs-sm)', fontWeight: 700, color: 'var(--color-ink)' },
  photoRow: { display: 'flex', alignItems: 'center', gap: 14 },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: '50%',
    background: 'var(--color-bg)',
    border: '1px solid var(--color-divider)',
    display: 'grid',
    placeItems: 'center',
    fontSize: 'var(--fs-lg)',
    fontWeight: 700,
    color: 'var(--color-ink-muted)',
    overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%', objectFit: 'cover' },
  photoActions: { display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' },
  uploadBtn: {
    height: 30,
    display: 'inline-flex',
    alignItems: 'center',
    padding: '0 12px',
    borderRadius: 7,
    border: '1px solid var(--color-primary)',
    background: 'var(--color-surface)',
    color: 'var(--color-primary)',
    fontSize: 'var(--fs-sm)',
    fontWeight: 600,
    cursor: 'pointer',
  },
  hint: { fontSize: 'var(--fs-sm)', color: 'var(--color-ink-muted)' },
  input: {
    height: 34,
    padding: '0 10px',
    borderRadius: 8,
    border: '1px solid var(--color-divider)',
    background: 'var(--color-surface)',
    color: 'var(--color-ink)',
    fontSize: 'var(--fs-base)',
  },
  textarea: {
    padding: '8px 10px',
    borderRadius: 8,
    border: '1px solid var(--color-divider)',
    background: 'var(--color-surface)',
    color: 'var(--color-ink)',
    fontSize: 'var(--fs-base)',
    resize: 'vertical',
  },
  help: { fontSize: 'var(--fs-sm)', color: 'var(--color-ink-muted)' },
  actions: { display: 'flex', gap: 8, marginTop: 2 },
  flash: {
    margin: 0,
    padding: '10px 12px',
    borderRadius: 8,
    borderLeft: '4px solid var(--color-primary)',
    background: 'var(--color-primary-wash)',
    fontSize: 'var(--fs-base)',
    color: 'var(--color-ink)',
    fontWeight: 600,
  },
  alert: {
    margin: 0,
    padding: '10px 12px',
    borderRadius: 8,
    borderLeft: '4px solid var(--color-danger)',
    background: 'var(--color-danger-bg)',
    fontSize: 'var(--fs-base)',
    color: 'var(--color-danger)',
    fontWeight: 600,
  },
}
