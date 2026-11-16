-- Migração inicial do banco (PostgreSQL), gerada sem banco com:
--   npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script
-- Como aplicar (dentro de api/, com DATABASE_URL apontando para o banco):
--   npx prisma migrate deploy
-- Banco que já foi criado com `prisma db push` (tabelas existentes): marque esta migração como
-- aplicada antes do deploy, para não recriar as tabelas:
--   npx prisma migrate resolve --applied 0001_init
-- Mudanças futuras no schema.prisma: `npx prisma migrate dev --name <descricao>` em ambiente de
-- desenvolvimento com PostgreSQL, gerando uma nova pasta em prisma/migrations.

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "PlanType" AS ENUM ('FREE', 'LEADER_MONTHLY', 'TRANSITION_PASS', 'STORE_MULTI', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'PAST_DUE', 'CANCELED');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('OWNER', 'STORE_MANAGER', 'SECTION_LEADER', 'HR_AUDITOR');

-- CreateEnum
CREATE TYPE "DayOfWeek" AS ENUM ('SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB', 'DOM');

-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('ACTIVE', 'VACATION', 'MEDICAL_LEAVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "AssignmentType" AS ENUM ('WORK', 'OFF', 'ABSENCE');

-- CreateEnum
CREATE TYPE "SundayRule" AS ENUM ('1_IN_3', '1_IN_2', 'CUSTOM');

-- CreateEnum
CREATE TYPE "PaymentGateway" AS ENUM ('ABACATEPAY', 'ASAAS', 'MERCADOPAGO');

-- CreateEnum
CREATE TYPE "BillingCycle" AS ENUM ('MONTHLY', 'YEARLY', 'ONE_TIME_45D');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('PIX', 'CREDIT_CARD');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'EXPIRED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "AbsenceType" AS ENUM ('VACATION', 'MEDICAL', 'COMP_TIME', 'OTHER');

-- CreateEnum
CREATE TYPE "ScheduleStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SwapStatus" AS ENUM ('PENDING_PEER', 'PENDING_MANAGER', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cnpj" TEXT,
    "plan" "PlanType" NOT NULL DEFAULT 'FREE',
    "subscriptionStatus" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "planExpiresAt" TIMESTAMP(3),
    "gatewayCustomerId" TEXT,
    "gatewaySubscriptionId" TEXT,
    "referralCode" TEXT NOT NULL,
    "referredByCode" TEXT,
    "bonusDaysAccumulated" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentTransaction" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "gateway" "PaymentGateway" NOT NULL,
    "externalId" TEXT NOT NULL,
    "planPurchased" "PlanType" NOT NULL,
    "billingCycle" "BillingCycle" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "pixQrCode" TEXT,
    "pixCopyPaste" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Store" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "logoUrl" TEXT,
    "city" TEXT NOT NULL DEFAULT '',
    "state" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "Store_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "storeId" TEXT,
    "name" TEXT NOT NULL,
    "defaultSundayRule" "SundayRule" NOT NULL DEFAULT '1_IN_3',
    "weeklyHoursTarget" INTEGER NOT NULL DEFAULT 42,
    "minBreakMinutes" INTEGER NOT NULL DEFAULT 60,
    "sundayCycleOffset" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserAccount" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "phone" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'OWNER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftTemplate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "breakDurationMinutes" INTEGER NOT NULL DEFAULT 60,
    "color" TEXT NOT NULL DEFAULT '#2563EB',
    "isNightShift" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ShiftTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoverageRule" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "dayOfWeek" "DayOfWeek" NOT NULL,
    "minTotalStaff" INTEGER NOT NULL,
    "requiredTags" JSONB NOT NULL DEFAULT '[]',
    "peakHours" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "CoverageRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "accessToken" TEXT NOT NULL,
    "roleTitle" TEXT NOT NULL DEFAULT '',
    "tags" TEXT[],
    "sundayGroup" INTEGER NOT NULL DEFAULT 1,
    "customSundayRule" "SundayRule",
    "fixedConstraints" JSONB,
    "status" "EmployeeStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Absence" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "type" "AbsenceType" NOT NULL,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT NOT NULL,
    "notes" TEXT,

    CONSTRAINT "Absence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleCycle" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "weekStartDate" TEXT NOT NULL,
    "cycleWeek" INTEGER NOT NULL,
    "status" "ScheduleStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "publishedBy" TEXT,

    CONSTRAINT "ScheduleCycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyAssignment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "scheduleCycleId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "dayOfWeek" "DayOfWeek" NOT NULL,
    "type" "AssignmentType" NOT NULL,
    "shiftId" TEXT,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "DailyAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftSwapRequest" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "targetEmployeeId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "requesterShiftId" TEXT,
    "targetShiftId" TEXT,
    "cltValidationPassed" BOOLEAN NOT NULL DEFAULT false,
    "cltWarnings" TEXT[],
    "status" "SwapStatus" NOT NULL DEFAULT 'PENDING_PEER',
    "reviewedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShiftSwapRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "departmentId" TEXT,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "details" TEXT NOT NULL,
    "ip" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_UserDepartments" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_UserDepartments_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_referralCode_key" ON "Organization"("referralCode");

-- CreateIndex
CREATE INDEX "PaymentTransaction_organizationId_idx" ON "PaymentTransaction"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentTransaction_gateway_externalId_key" ON "PaymentTransaction"("gateway", "externalId");

-- CreateIndex
CREATE INDEX "Store_organizationId_idx" ON "Store"("organizationId");

-- CreateIndex
CREATE INDEX "Department_organizationId_idx" ON "Department"("organizationId");

-- CreateIndex
CREATE INDEX "Department_storeId_idx" ON "Department"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "UserAccount_email_key" ON "UserAccount"("email");

-- CreateIndex
CREATE INDEX "UserAccount_organizationId_idx" ON "UserAccount"("organizationId");

-- CreateIndex
CREATE INDEX "ShiftTemplate_organizationId_idx" ON "ShiftTemplate"("organizationId");

-- CreateIndex
CREATE INDEX "ShiftTemplate_departmentId_idx" ON "ShiftTemplate"("departmentId");

-- CreateIndex
CREATE INDEX "CoverageRule_organizationId_idx" ON "CoverageRule"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "CoverageRule_departmentId_dayOfWeek_key" ON "CoverageRule"("departmentId", "dayOfWeek");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_accessToken_key" ON "Employee"("accessToken");

-- CreateIndex
CREATE INDEX "Employee_organizationId_idx" ON "Employee"("organizationId");

-- CreateIndex
CREATE INDEX "Employee_departmentId_idx" ON "Employee"("departmentId");

-- CreateIndex
CREATE INDEX "Absence_organizationId_idx" ON "Absence"("organizationId");

-- CreateIndex
CREATE INDEX "Absence_employeeId_idx" ON "Absence"("employeeId");

-- CreateIndex
CREATE INDEX "ScheduleCycle_organizationId_idx" ON "ScheduleCycle"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleCycle_departmentId_weekStartDate_key" ON "ScheduleCycle"("departmentId", "weekStartDate");

-- CreateIndex
CREATE INDEX "DailyAssignment_organizationId_idx" ON "DailyAssignment"("organizationId");

-- CreateIndex
CREATE INDEX "DailyAssignment_scheduleCycleId_idx" ON "DailyAssignment"("scheduleCycleId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyAssignment_employeeId_date_key" ON "DailyAssignment"("employeeId", "date");

-- CreateIndex
CREATE INDEX "ShiftSwapRequest_organizationId_idx" ON "ShiftSwapRequest"("organizationId");

-- CreateIndex
CREATE INDEX "AuditLog_organizationId_timestamp_idx" ON "AuditLog"("organizationId", "timestamp");

-- CreateIndex
CREATE INDEX "_UserDepartments_B_index" ON "_UserDepartments"("B");

-- AddForeignKey
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Store" ADD CONSTRAINT "Store_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAccount" ADD CONSTRAINT "UserAccount_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftTemplate" ADD CONSTRAINT "ShiftTemplate_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoverageRule" ADD CONSTRAINT "CoverageRule_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Absence" ADD CONSTRAINT "Absence_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleCycle" ADD CONSTRAINT "ScheduleCycle_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyAssignment" ADD CONSTRAINT "DailyAssignment_scheduleCycleId_fkey" FOREIGN KEY ("scheduleCycleId") REFERENCES "ScheduleCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyAssignment" ADD CONSTRAINT "DailyAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyAssignment" ADD CONSTRAINT "DailyAssignment_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "ShiftTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftSwapRequest" ADD CONSTRAINT "ShiftSwapRequest_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftSwapRequest" ADD CONSTRAINT "ShiftSwapRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftSwapRequest" ADD CONSTRAINT "ShiftSwapRequest_targetEmployeeId_fkey" FOREIGN KEY ("targetEmployeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_UserDepartments" ADD CONSTRAINT "_UserDepartments_A_fkey" FOREIGN KEY ("A") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_UserDepartments" ADD CONSTRAINT "_UserDepartments_B_fkey" FOREIGN KEY ("B") REFERENCES "UserAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

