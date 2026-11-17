-- AlterTable
ALTER TABLE "UserAccount" ADD COLUMN     "tokenVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "AuditLog_organizationId_departmentId_timestamp_idx" ON "AuditLog"("organizationId", "departmentId", "timestamp");

