-- Additive: contact-level lead scoring foundation (CRM hygiene, Phase 0).
-- Deterministic score persisted on Contact by recomputeContactScore().
ALTER TABLE `Contact` ADD COLUMN `leadScore` INTEGER NULL;
ALTER TABLE `Contact` ADD COLUMN `leadScoreGrade` VARCHAR(191) NULL;
ALTER TABLE `Contact` ADD COLUMN `leadScoreSignals` VARCHAR(500) NULL;
ALTER TABLE `Contact` ADD COLUMN `leadScoreUpdatedAt` DATETIME(3) NULL;
