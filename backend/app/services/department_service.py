"""진료과 조회 (갭 #92, SCHED-DEPT-09·10).

⚠️ 옛 코드는 `select id, name from departments order by name`이라 is_active를 조회도 필터도
   하지 않았다 — 진료과를 꺼도 환자 앱 예약 1단계·캘린더 진료과 칩·의사 등록 목록에 계속 떴다.
   이 조회가 그 세 곳이 공유하는 유일한 목록 창구다. 기본은 활성만 준다.
"""
from __future__ import annotations


async def list_departments(conn, include_inactive: bool = False) -> list[dict]:
    """진료과 목록. 기본은 활성만, include_inactive=True면 중지된 것까지 준다(관리 화면용)."""
    if include_inactive:
        rows = await conn.fetch(
            "select id, name, is_active from departments order by name"
        )
    else:
        rows = await conn.fetch(
            "select id, name, is_active from departments where is_active order by name"
        )
    return [dict(row) for row in rows]
