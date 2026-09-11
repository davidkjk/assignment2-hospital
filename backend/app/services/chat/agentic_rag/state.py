from typing import Optional, TypedDict


class AgenticRagState(TypedDict, total=False):
    message: str                 # 환자 원문(화면·LLM 질문·근거)
    initial_query: str           # 최초 검색 질의(retrieval_query or message)
    sub_queries: list[str]       # 현재 검색할 질의들(decompose 산물 / rewrite가 교체)
    chunks: list[dict]           # 검색·병합·재정렬된 청크(관련도순)
    sources: list[dict]          # 근거 스냅샷(record_answer_sources 형식)
    examples: list[dict]         # few-shot 예시
    top_restricted: bool         # 1위가 제한자료
    below_floor: bool            # 1위가 floor 미만(근거 부족)
    relevant: bool               # grade 결과
    attempts: int                # 교정 재검색 횟수
    draft: str                   # generate 산물(버퍼, 미방출)
    sentinel: Optional[str]      # "no_answer" | "needs_clarify" | None
    clarify_question: Optional[str]
    grounded: bool               # verify 결과
    regen: int                   # 재생성 횟수
    outcome: Optional[dict]      # 최종 rag_answer 동형 dict
