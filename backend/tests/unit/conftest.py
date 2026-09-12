"""순수(DB 불필요) 유닛 테스트 전용 conftest.

상위 tests/conftest.py의 autouse 픽스처 둘(_reset_app_db_pool·_cleanup_committed_data)은
매 테스트마다 asyncpg 풀을 열고 여러 테이블을 TRUNCATE/DELETE한다(공용 로컬 DB의 데모 시드를
지운다). 제공자 클라이언트(Solapi·FCM·서명·콜백 파싱)는 DB가 전혀 필요 없으므로, 같은 이름의
no-op 픽스처로 상위 autouse를 가려(shadow) DB 없이 즉시 돌게 한다.
"""
import pytest_asyncio


@pytest_asyncio.fixture(autouse=True)
async def _reset_app_db_pool():
    yield


@pytest_asyncio.fixture(autouse=True)
async def _cleanup_committed_data():
    yield
