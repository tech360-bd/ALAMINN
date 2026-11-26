-- Additive: contact-level lead scoring foundation (CRM hygiene, Phase 0).
-- Deterministic score persisted on Contact by recomputeContactScore().
ALTER TABLE "Contact" ADD COLUMN "leadScore" INTEGER;
ALTER TABLE "Contact" ADD COLUMN "leadScoreGrade" TEXT;
ALTER TABLE "Contact" ADD COLUMN "leadScoreSignals" TEXT;
ALTER TABLE "Contact" ADD COLUMN "leadScoreUpdatedAt" DATETIME;
