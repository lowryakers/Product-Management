-- CreateEnum
CREATE TYPE "CodeRequestStatus" AS ENUM ('OPEN', 'READY', 'CREATED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ShareScope" AS ENUM ('SKU', 'GTIN', 'BOTH');

-- CreateTable
CREATE TABLE "CodeRequest" (
    "id" TEXT NOT NULL,
    "ref" SERIAL NOT NULL,
    "productLine" TEXT NOT NULL,
    "format" "PackFormat" NOT NULL,
    "baseFlavor" TEXT NOT NULL,
    "flavor" TEXT,
    "notes" TEXT,
    "suggestedSku" TEXT,
    "skuBasis" TEXT,
    "suggestedGtin" TEXT,
    "gtinBasis" TEXT,
    "sku" TEXT,
    "skuSetAt" TIMESTAMP(3),
    "skuSetBy" TEXT,
    "skuAssigneeUserId" TEXT,
    "skuAssigneeName" TEXT,
    "gtin" TEXT,
    "gtinSetAt" TIMESTAMP(3),
    "gtinSetBy" TEXT,
    "gtinAssigneeUserId" TEXT,
    "gtinAssigneeName" TEXT,
    "shareToken" TEXT,
    "shareScope" "ShareScope" NOT NULL DEFAULT 'SKU',
    "shareExpiresAt" TIMESTAMP(3),
    "shareOpenedAt" TIMESTAMP(3),
    "status" "CodeRequestStatus" NOT NULL DEFAULT 'OPEN',
    "createdById" TEXT,
    "inboxItemId" TEXT,
    "productSku" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CodeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CodeRequest_ref_key" ON "CodeRequest"("ref");

-- CreateIndex
CREATE UNIQUE INDEX "CodeRequest_shareToken_key" ON "CodeRequest"("shareToken");

-- CreateIndex
CREATE INDEX "CodeRequest_status_idx" ON "CodeRequest"("status");

-- AddForeignKey
ALTER TABLE "CodeRequest" ADD CONSTRAINT "CodeRequest_skuAssigneeUserId_fkey" FOREIGN KEY ("skuAssigneeUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodeRequest" ADD CONSTRAINT "CodeRequest_gtinAssigneeUserId_fkey" FOREIGN KEY ("gtinAssigneeUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodeRequest" ADD CONSTRAINT "CodeRequest_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodeRequest" ADD CONSTRAINT "CodeRequest_inboxItemId_fkey" FOREIGN KEY ("inboxItemId") REFERENCES "InboxItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
