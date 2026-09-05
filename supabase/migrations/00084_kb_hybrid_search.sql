-- ============================================================================
-- KB 하이브리드 검색 — 벡터(의미) + 트라이그램(글자) 융합(RRF).
-- 배경(2026-09-04 실측): text-embedding-3-small·한국어 짧은 질의에서 관련 문서도
--   코사인 0.35~0.6대라 순수 벡터만으론 "와이파이"처럼 글자는 똑같은데 뜻이 흐릿한
--   외래어·고유명사를 놓쳐 인계로 빠졌다. 트라이그램(글자 3개 단위) 어휘 검색을 더해
--   Reciprocal Rank Fusion(등수 기반 융합, 점수 스케일 불일치 회피)으로 합친다.
-- 규모: 청크 수백 개 수준이라 word_similarity() 순차 스캔으로 충분. GIN 인덱스는
--   향후 <% 연산자 전환·규모 증가 대비로 함께 만든다(무해).
-- ============================================================================
create extension if not exists pg_trgm;

create index if not exists idx_kb_chunks_content_trgm
  on kb_chunks using gin (content gin_trgm_ops);

-- 하이브리드 검색: 벡터 top20 ∪ 트라이그램 top20을 RRF(k=60)로 융합해 상위 match_count개.
-- similarity=코사인(벡터 순위 밖이면 0), keyword_sim=트라이그램 word_similarity, rrf=융합 점수.
-- 답변/인계 게이트는 서비스(rag_service)가 max(similarity, keyword_sim)와 LLM 판정으로 결정.
create or replace function match_kb_chunks_hybrid(
  query_embedding vector(1536), query_text text, match_count int)
returns table (id uuid, document_id uuid, content text, title text,
               is_restricted boolean, similarity float, keyword_sim float, rrf float)
language sql stable as $$
  with v as (
    select c.id,
           row_number() over (order by c.embedding <=> query_embedding) as rk,
           1 - (c.embedding <=> query_embedding) as sim
    from kb_chunks c join kb_documents d on d.id = c.document_id
    where d.status = 'approved'
    order by c.embedding <=> query_embedding
    limit 20
  ),
  l as (
    select c.id,
           row_number() over (order by word_similarity(query_text, c.content) desc) as rk,
           word_similarity(query_text, c.content) as ws
    from kb_chunks c join kb_documents d on d.id = c.document_id
    where d.status = 'approved' and word_similarity(query_text, c.content) > 0.2
    order by word_similarity(query_text, c.content) desc
    limit 20
  ),
  fused as (
    select coalesce(v.id, l.id) as id,
           coalesce(1.0 / (60 + v.rk), 0) + coalesce(1.0 / (60 + l.rk), 0) as rrf,
           coalesce(v.sim, 0) as sim,
           coalesce(l.ws, 0) as ws
    from v full outer join l on v.id = l.id
  )
  select c.id, c.document_id, c.content, d.title, d.is_restricted,
         f.sim as similarity, f.ws as keyword_sim, f.rrf
  from fused f
  join kb_chunks c on c.id = f.id
  join kb_documents d on d.id = c.document_id
  order by f.rrf desc
  limit match_count
$$;
