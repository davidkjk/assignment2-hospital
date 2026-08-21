# 기반 ⑦ 잔여 수정 감사 (파일럿)

## 감사 기준

- 기준일: 2026-08-20.
- `HANDOFF.md:219-229`의 「⑦ 구현 때 확인」과 `HANDOFF.md:226`의 「1단계 코드 실수정」을 기준으로, 두 foundation 플랜과 현재 `backend/app/`, `supabase/migrations/`를 대조했다.
- 적용 여부는 현재 파일의 `rg` 결과와 `file:line`만으로 판정했다. 현재 작업 트리의 기존 미추적 파일 `docs/superpowers/IMPL-ORCHESTRATION-PLAYBOOK.md`는 감사 대상이 아니며 건드리지 않았다.

결론적으로 기반이 소유한 잔여 수정은 3건이며 모두 `no`다.

| 항목 | 현재 적용 여부 |
| --- | --- |
| 인증 실패 계정 열거 방지 | **no** |
| Python DB 예외 원문 노출 6곳 제거 | **no** |
| 예약 진행 상태 한 칸 역전이(Python + DB) | **no** |

## 잔여 수정 1 — 계정 열거 방지: **no**

1. **무엇을 고치나 — 플랜 근거**

   `get_current_staff`에서 staff 행이 없거나 비활성인 경우 계정 존재 여부가 드러나는 403 문구를 제거하고, 존재하지 않음·비활성·staff 행 없음 모두 동일한 401/일반 문구로 정규화한다. Foundation 인증 플랜의 현재 분기는 `docs/superpowers/plans/2026-07-27-foundation-auth-data-model.md:2569-2593`에 있고, 1단계 코드 수정 지시는 `docs/superpowers/plans/2026-08-15-staff-web.md:1176-1187`, TDD 계약은 `:1690-1710`에 있다.

2. **현재 코드 증거와 판정**

   ```text
   backend/app/core/security.py:42  if row is None or not row["is_active"]:
   backend/app/core/security.py:43      raise HTTPException(status_code=403, detail="사용 중지된 계정이거나 등록되지 않은 계정입니다.")
   ```

   따라서 특정 계정 상태를 응답하는 현재 구현이며 **no**다.

3. **아직이면 지킬 TDD**

   `test_인증_실패는_원인을_알려주지_않는다` — 세 경우 모두 `resp.status_code == 401`이고 `resp.json()["detail"] == "로그인 정보를 확인해 주세요."`임을 assert한다.

## 잔여 수정 2 — Python DB 예외 원문 노출 6곳: **no**

1. **무엇을 고치나 — 플랜 근거**

   DB/드라이버 예외를 `AppError(str(exc))`로 그대로 사용자 응답에 넣지 말고, 고정된 한글 `AppError`로 매핑한다. 원문은 오류 로그에만 남긴다. 한글 노출·미처리 예외 로그 규칙은 `docs/superpowers/plans/2026-07-27-foundation-auth-data-model.md:23-24`, 핸들러 계약은 `:2677-2711`, 기존 TDD의 내부 문구 비노출·로그 보존 계약은 `:2766-2781`에 있다. Foundation 서비스 플랜에 해당 전달 경로가 명시된 곳은 `:3793-3800`, `:3835-3836`, `:4185-4188`, `:4227-4230`이다.

2. **현재 코드 증거와 판정**

   `rg -n 'AppError\(str\(exc\)' backend/app`의 현재 결과는 다음 6곳이다.

   ```text
   backend/app/services/appointment_service.py:88
   backend/app/services/appointment_service.py:93
   backend/app/services/appointment_service.py:136
   backend/app/services/medical_record_service.py:34
   backend/app/services/medical_record_service.py:123
   backend/app/services/medical_record_service.py:179
   ```

   `backend/app/core/errors.py:22-23`은 `AppError.message`를 그대로 `detail`로 반환한다. `:26-31`의 고정 일반 문구는 미처리 예외에만 적용되므로 위 6곳을 해결하지 못한다. 따라서 **no**다. `errors.py:27`의 `log_error(..., str(exc))`는 로그 저장이지 사용자 노출 위치가 아니므로 6곳에 포함하지 않았다.

3. **아직이면 지킬 TDD**

   `test_service_postgres_errors_are_not_returned_verbatim` — 위 6개 실패 경로에 내부 드라이버 문구를 주입하고 응답 `detail`에는 그 원문이 없으며 고정 한글 문구만 있고 원문은 `system_error_log`에만 남는 것을 assert한다.

## 잔여 수정 3 — 예약 진행 상태 한 칸 역전이: **no**

1. **무엇을 고치나 — 플랜 근거**

   오늘 병원의 진행 4상태만 한 칸 뒤로 되돌리는 경로와 규칙을 Python 및 DB 양쪽에 추가한다: `도착 -> 예약확정`, `진료대기 -> 도착`, `진료중 -> 진료대기`, `진료완료 -> 진료중`. 취소 계열은 되돌리지 않고, 필요한 사유·이력은 기존 이력 경로를 유지한다. Foundation의 상태 규칙·트리거 소유 범위는 `docs/superpowers/plans/2026-07-27-foundation-auth-data-model.md:1048-1076`, 현재 Python 규칙의 플랜은 `:3719-3725`에 있다. 두 방어선을 함께 고치라는 후속 구현 지시는 `docs/superpowers/plans/2026-08-15-staff-web.md:2524-2533`, 양쪽 회귀 테스트는 `:2836-2843`, 기존 `00005`를 수정하지 않고 트리거 함수를 새 migration으로 덧붙이는 지시는 `:2967-2973`에 있다.

2. **현재 코드 증거와 판정**

   Python allowlist는 `backend/app/services/appointment_service.py:11-17`에서 5개 source 상태의 정방향 전이만 가진다.

   ```text
   도착 -> 진료대기
   진료대기 -> 진료중
   진료중 -> 진료완료
   ```

   DB allowlist도 `supabase/migrations/00005_appointments.sql:347-358`에서 같은 정방향 행만 삽입한다. `rg --files supabase/migrations`의 현재 목록은 `00001`부터 `00016`까지이며 `00021`, `00037_status_undo.sql`, `status_undo` 파일은 없다. 따라서 Python과 DB 모두 미적용인 **no**다.

   번호는 Handoff가 `T7 00021`(`HANDOFF.md:226`)로 표기했지만 후속 플랜의 파일명은 `00037_status_undo.sql`(`docs/superpowers/plans/2026-08-15-staff-web.md:2529`)이다. 구현 시 `00005`를 수정하지 말고 실제 적용 시점의 다음 migration 번호를 확정해야 한다.

3. **아직이면 지킬 TDD**

   `test_파이썬과_DB_트리거_양쪽이_역전이를_허용한다`와 `test_한_칸씩만_되돌린다` — `진료중` 예약의 `undo_status` 결과와 DB 저장 상태가 모두 `진료대기`이고, `진료완료 -> 진료대기` 같은 두 칸 역전이는 거절됨을 assert한다.

## 이미 적용되어 잔여가 아닌 ⑦ 공용 항목

`scheduled_notifications`는 shared-data-model 플랜의 섹션 4 ⑦이며, 플랜은 `docs/superpowers/plans/2026-08-14-foundation-migrations-00010-shared-data-model.md:783-792`, 테스트 계약은 `:794-846`, SQL 계약은 `:853-893`에 있다. 현재 `supabase/migrations/00016_scheduled_notifications.sql:8-39`에 테이블·pending partial index·RLS·역할 정책이 모두 존재하므로 **yes**, 추가 기반 수정은 없다.

`auto_confirm_app_bookings`/설정 화면, 문진·전화 분리·예약번호 보강, 디스패처 및 환자앱/직원웹 화면 항목은 `HANDOFF.md:221-229`에서 다른 태스크 소유로 배정되어 있다. 특히 설정 화면 플랜은 해당 칸을 직원웹 migration `00051`에서 만들고 환자앱 `00020/00023`과 공유한다고 명시한다(`docs/superpowers/plans/2026-08-15-staff-web.md:13542-13556`, `:13746-13753`). 따라서 기반 ⑦ 잔여 수정에는 포함하지 않았다.
