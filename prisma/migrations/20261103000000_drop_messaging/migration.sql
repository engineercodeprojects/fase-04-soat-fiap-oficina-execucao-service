-- RFC-0008 (03/11/2026): comunicacao HTTP entre os servicos; sem outbox/dedup (ADR-0009).
DROP INDEX IF EXISTS "outbox_status_criada_em_idx";
DROP TABLE IF EXISTS "outbox";
DROP TABLE IF EXISTS "processed_messages";
