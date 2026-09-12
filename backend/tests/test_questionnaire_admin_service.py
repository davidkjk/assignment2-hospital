"""[Task 22a][QADM-*] 관리자 문진표 관리 서비스.

⭐ 결정 12 — 불변 버전. AD-050/#14 — 관리자는 양식만, 답변 안 봄. AD-065·066 — 삭제·숨김·이름 없음.

테스트는 db_conn(오너 롤·롤백 트랜잭션)을 서비스에 주입해, seed된 미커밋 데이터를 보게 한다
(patient_merge_service 테스트와 같은 패턴). 역할 거절은 서비스의 파이썬 가드가 DB 접근 전에 낸다.
"""
import random

import pytest
import pytest_asyncio
from app.core.errors import AppError
from app.core.security import StaffContext
from app.services import questionnaire_admin_service as svc
from tests.conftest import seed_staff


@pytest_asyncio.fixture
async def admin_ctx(db_conn):
    s = await seed_staff(db_conn, role="admin")
    return StaffContext(id=s["staff_id"], auth_user_id=s["auth_user_id"], role="admin", department_id=None)


@pytest_asyncio.fixture
async def doctor_ctx(db_conn):
    s = await seed_staff(db_conn, role="doctor")
    return StaffContext(id=s["staff_id"], auth_user_id=s["auth_user_id"], role="doctor", department_id=None)


@pytest_asyncio.fixture
async def dept_id(db_conn):
    return await db_conn.fetchval("insert into departments (name) values ('내과') returning id")


@pytest.mark.asyncio
async def test_QADM_DEPT_01_진료과는_이름_다음_id로_정렬한다(db_conn, admin_ctx):
    """[QADM-DEPT-01] 이름이 같은 진료과가 있어도 순서가 흔들리지 않는다.

    동점 키(id)가 없으면 새로고침마다 줄 순서가 바뀌어, 관리자가 방금 고른 진료과를 다시 못 찾는다.
    """
    for name in ("정형외과", "내과", "내과"):
        await db_conn.execute("insert into departments (name) values ($1)", name)

    rows = await svc.list_departments_with_status(admin_ctx, conn=db_conn)
    names = [r["name"] for r in rows]
    assert names == sorted(names)
    same = [r for r in rows if r["name"] == "내과"]
    assert [str(r["id"]) for r in same] == sorted(str(r["id"]) for r in same)


@pytest.mark.asyncio
async def test_QADM_DEPT_04_양식이_없는_진료과도_목록에_나온다(db_conn, admin_ctx):
    """[QADM-DEPT-04] 「없음」은 숨길 이유가 아니라 만들어야 할 신호다.

    목록에서 빼면 새 진료과에 문진표를 만들 길이 사라진다 — 막다른 길이 된다.
    """
    await db_conn.execute("insert into departments (name) values ('산부인과')")
    rows = await svc.list_departments_with_status(admin_ctx, conn=db_conn)
    row = next(r for r in rows if r["name"] == "산부인과")
    assert row["active_version"] is None and row["question_count"] == 0


@pytest.mark.asyncio
async def test_QADM_FORM_05_질문_종류는_셋뿐이다(db_conn, admin_ctx, dept_id):
    """[QADM-FORM-05][QNR-TYPE-*] 환자 앱이 그릴 수 있는 입력칸만 만들 수 있다."""
    assert svc.QUESTION_TYPES == ("short_text", "long_text", "yes_no")
    with pytest.raises(AppError):
        await svc.save_version(dept_id, [{"id": "Q-A-01", "text": "가", "type": "dropdown", "required": False, "show_to": "all"}], None, admin_ctx, conn=db_conn)


@pytest.mark.asyncio
async def test_QADM_FORM_07_보일_대상은_셋뿐이다(db_conn, admin_ctx, dept_id):
    """[QADM-FORM-07][QNR-SHOW-*] 갭 #17 — 관리자가 정한 조건과 앱의 판단 기준을 잇는다."""
    assert svc.SHOW_TO == ("all", "female", "male")
    with pytest.raises(AppError):
        await svc.save_version(dept_id, [{"id": "Q-A-01", "text": "가", "type": "short_text", "required": False, "show_to": "adult"}], None, admin_ctx, conn=db_conn)


@pytest.mark.asyncio
async def test_QADM_FORM_02_문항_ID는_한_버전_안에서_고유하다(db_conn, admin_ctx, dept_id):
    """[QADM-FORM-02] ID는 답변을 붙이는 열쇠다 — 겹치면 답이 덮인다."""
    dup = [
        {"id": "Q-A-01", "text": "가", "type": "short_text", "required": False, "show_to": "all"},
        {"id": "Q-A-01", "text": "나", "type": "short_text", "required": False, "show_to": "all"},
    ]
    with pytest.raises(AppError):
        await svc.save_version(dept_id, dup, None, admin_ctx, conn=db_conn)


@pytest.mark.asyncio
async def test_QADM_FORM_04_지운_문항_ID는_다시_쓰지_않는다(db_conn, admin_ctx, dept_id):
    """[QADM-FORM-04][QNR-ID-07] 지운 ID를 새 질문에 재사용하면 과거 답이 엉뚱한 질문에 붙는다."""
    q = [{"id": "Q-ALLERGY-01", "text": "알레르기가 있으신가요?", "type": "yes_no", "required": False, "show_to": "all"}]
    v1 = await svc.save_version(dept_id, q, None, admin_ctx, conn=db_conn)
    v2 = await svc.save_version(dept_id, [], v1["id"], admin_ctx, conn=db_conn)  # 문항을 지웠다

    with pytest.raises(AppError):
        await svc.save_version(
            dept_id,
            [{"id": "Q-ALLERGY-01", "text": "임신 중이신가요?", "type": "yes_no", "required": False, "show_to": "female"}],
            v2["id"],
            admin_ctx,
            conn=db_conn,
        )


@pytest.mark.asyncio
async def test_QADM_FORM_04_어떤_편집_순서로도_ID가_재사용되지_않는다(db_conn, admin_ctx, dept_id):
    """[QADM-FORM-04] 🎲 속성 테스트 — 예시 하나로는 「항상 그렇다」를 못 본다.

    추가·삭제·순서변경을 무작위로 섞어 **어떤 편집 이력에서도** 한 번 쓰인 ID가 다른 질문에
    다시 붙지 않는지 본다(next_question_id가 지운 ID까지 영원히 피한다).
    """
    seen_text_by_id: dict[str, str] = {}
    current: list[dict] = []
    base = None
    rnd = random.Random(20260816)

    for step in range(10000):
        op = rnd.choice(("add", "remove", "move"))
        if op == "add" and len(current) < 30:
            new_id = svc.next_question_id(seen_text_by_id.keys())
            current.append({"id": new_id, "text": f"질문{step}", "type": "short_text", "required": False, "show_to": "all"})
        elif op == "remove" and current:
            current.pop(rnd.randrange(len(current)))
        elif op == "move" and len(current) > 1:
            i = rnd.randrange(len(current))
            j = rnd.randrange(len(current))
            current[i], current[j] = current[j], current[i]

        for q in current:
            if q["id"] in seen_text_by_id:
                assert seen_text_by_id[q["id"]] == q["text"], f"ID {q['id']}가 다른 질문에 재사용됐다"
            else:
                seen_text_by_id[q["id"]] = q["text"]

    saved = await svc.save_version(dept_id, current, base, admin_ctx, conn=db_conn)
    assert len({q["id"] for q in saved["questions"]}) == len(saved["questions"])


@pytest.mark.asyncio
async def test_QADM_FORM_08_순서를_바꿔도_문항_ID는_그대로다(db_conn, admin_ctx, dept_id):
    """[QADM-FORM-08] 바뀌는 것은 표시 순서뿐이다 — 키는 ID로 두어 과거 답이 안 어긋난다."""
    q = [
        {"id": "Q-A-01", "text": "가", "type": "short_text", "required": False, "show_to": "all"},
        {"id": "Q-B-02", "text": "나", "type": "short_text", "required": False, "show_to": "all"},
    ]
    v1 = await svc.save_version(dept_id, q, None, admin_ctx, conn=db_conn)
    v2 = await svc.save_version(dept_id, list(reversed(q)), v1["id"], admin_ctx, conn=db_conn)

    assert [x["id"] for x in v2["questions"]] == ["Q-B-02", "Q-A-01"]
    assert {x["id"] for x in v2["questions"]} == {x["id"] for x in v1["questions"]}


@pytest.mark.asyncio
async def test_QADM_VERSION_03_버전_기록은_최신순이고_답변_수를_안_끌어온다(db_conn, admin_ctx, dept_id):
    """[QADM-VERSION-03] 개인정보 최소화 — 관리자에게 필요한 것은 양식의 역사뿐이다."""
    v1 = await svc.save_version(dept_id, [], None, admin_ctx, conn=db_conn)
    await svc.save_version(dept_id, [], v1["id"], admin_ctx, conn=db_conn)

    form = await svc.get_department_form(dept_id, admin_ctx, conn=db_conn)
    assert [v["version_no"] for v in form["versions"]] == [2, 1]
    assert form["versions"][0]["is_active"] is True
    assert set(form["versions"][0]) == {"id", "version_no", "is_active", "created_at", "created_by_name", "question_count"}


@pytest.mark.asyncio
async def test_QADM_SAVE_06_저장한_직원이_비활성이어도_기록은_남는다(db_conn, admin_ctx, dept_id):
    """[QADM-SAVE-06][ALOG-LIST-03] 사람이 그만뒀다고 역사가 사라지면 안 된다."""
    v1 = await svc.save_version(dept_id, [], None, admin_ctx, conn=db_conn)
    await db_conn.execute("update staff set is_active = false where id = $1", admin_ctx.id)
    await db_conn.execute("update questionnaire_templates set created_by = null where id = $1", v1["id"])

    form = await svc.get_department_form(dept_id, admin_ctx, conn=db_conn)
    assert form["versions"][0]["created_by_name"] == "직원 정보 없음"


@pytest.mark.asyncio
async def test_QADM_SAVE_05_충돌은_409로_올라온다(db_conn, admin_ctx, dept_id):
    """[QADM-SAVE-05] DB의 40001을 화면이 알아들을 수 있는 오류로 바꾼다."""
    v1 = await svc.save_version(dept_id, [], None, admin_ctx, conn=db_conn)
    await svc.save_version(dept_id, [], v1["id"], admin_ctx, conn=db_conn)

    with pytest.raises(AppError) as exc:
        await svc.save_version(dept_id, [], v1["id"], admin_ctx, conn=db_conn)
    assert exc.value.status_code == 409


@pytest.mark.asyncio
async def test_QADM_SHELL_02_관리자가_아니면_서버가_거절한다(db_conn, doctor_ctx, dept_id):
    """[QADM-SHELL-02][SHELL-URL-01] 메뉴를 숨기는 것은 안내이지 방어가 아니다."""
    with pytest.raises(AppError) as exc:
        await svc.save_version(dept_id, [], None, doctor_ctx, conn=db_conn)
    assert exc.value.status_code == 403
