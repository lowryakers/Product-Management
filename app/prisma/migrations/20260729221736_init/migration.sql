-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'STAFF');

-- CreateEnum
CREATE TYPE "PackFormat" AS ENUM ('POUCH', 'STICK', 'BOX', 'CUP');

-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('CONCEPT', 'IN_DEVELOPMENT', 'ACTIVE', 'ON_HOLD', 'DISCONTINUED');

-- CreateEnum
CREATE TYPE "InboxArea" AS ENUM ('ARTWORK', 'FORMULA', 'SPEC', 'GTIN', 'SKU', 'NEW_SKU', 'PO', 'SHOPIFY', 'NFP', 'VENDOR', 'OTHER');

-- CreateEnum
CREATE TYPE "InboxChannel" AS ENUM ('TEXT', 'CALL', 'IN_PERSON', 'EMAIL', 'SLACK', 'AUDIT');

-- CreateEnum
CREATE TYPE "InboxStatus" AS ENUM ('NEW', 'TRIAGED', 'IN_PROGRESS', 'BLOCKED', 'DONE');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "ArtworkStage" AS ENUM ('BRIEF', 'IN_DESIGN', 'INTERNAL_REVIEW', 'REVISION', 'APPROVED', 'SENT_TO_VENDOR', 'VENDOR_PROOF', 'PRINT_READY', 'PRINTED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "NfpStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'CHANGES_REQUESTED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "RfqStatus" AS ENUM ('DRAFT', 'SENT', 'QUOTED', 'CLOSED');

-- CreateEnum
CREATE TYPE "PoStatus" AS ENUM ('DRAFT', 'SENT', 'ACKNOWLEDGED', 'IN_PRODUCTION', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PoLineStatus" AS ENUM ('ORDERED', 'ART_APPROVED', 'PLATES_MADE', 'IN_PRODUCTION', 'SHIPPED', 'RECEIVED', 'QC_PASSED', 'STOCKED', 'CANCELLED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'STAFF',
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "roleTitle" TEXT NOT NULL,
    "org" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "provides" TEXT,
    "isExternal" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackagingSpec" (
    "specId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "format" "PackFormat" NOT NULL,
    "materialStructure" TEXT,
    "zipper" TEXT,
    "printProcess" TEXT,
    "trimLengthMm" DECIMAL(10,2),
    "trimWidthMm" DECIMAL(10,2),
    "gussetMm" DECIMAL(10,2),
    "frontPanelMm" DECIMAL(10,2),
    "windDirection" TEXT,
    "coreIn" TEXT,
    "dielineRequired" BOOLEAN NOT NULL DEFAULT true,
    "vendorSpecString" TEXT,
    "notes" TEXT,
    "vendorId" TEXT,

    CONSTRAINT "PackagingSpec_pkey" PRIMARY KEY ("specId")
);

-- CreateTable
CREATE TABLE "Product" (
    "sku" TEXT NOT NULL,
    "legacySku" TEXT,
    "gtin" TEXT,
    "productLine" TEXT NOT NULL,
    "format" "PackFormat" NOT NULL,
    "flavor" TEXT NOT NULL,
    "baseFlavor" TEXT NOT NULL,
    "status" "ProductStatus" NOT NULL DEFAULT 'ACTIVE',
    "specId" TEXT,
    "shopifySku" TEXT,
    "shopifyVariantId" TEXT,
    "mrpFormulaId" TEXT,
    "formulaRev" TEXT,
    "eyemarkColor" TEXT,
    "dielineRequired" BOOLEAN NOT NULL DEFAULT true,
    "dataQualityFlag" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("sku")
);

-- CreateTable
CREATE TABLE "SkuColor" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "slot" INTEGER NOT NULL,
    "pms" TEXT,
    "hex" TEXT,
    "hexValid" BOOLEAN NOT NULL DEFAULT false,
    "pmsValid" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "SkuColor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InboxItem" (
    "id" TEXT NOT NULL,
    "ref" SERIAL NOT NULL,
    "clientId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "loggedById" TEXT,
    "sourceContactId" TEXT,
    "channel" "InboxChannel" NOT NULL DEFAULT 'TEXT',
    "area" "InboxArea" NOT NULL DEFAULT 'OTHER',
    "rawNote" TEXT NOT NULL,
    "decision" TEXT,
    "ownerId" TEXT,
    "dueDate" TIMESTAMP(3),
    "status" "InboxStatus" NOT NULL DEFAULT 'NEW',
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "triagedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "InboxItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArtworkVersion" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "stage" "ArtworkStage" NOT NULL DEFAULT 'BRIEF',
    "designerContactId" TEXT,
    "changeSummary" TEXT,
    "proofLink" TEXT,
    "printFileLink" TEXT,
    "driveFileId" TEXT,
    "nfpVersionId" TEXT,
    "gtinVerified" BOOLEAN NOT NULL DEFAULT false,
    "nfpVerified" BOOLEAN NOT NULL DEFAULT false,
    "eyemarkVerified" BOOLEAN NOT NULL DEFAULT false,
    "approvedByUserId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "sentToVendorAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArtworkVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NfpVersion" (
    "id" TEXT NOT NULL,
    "ref" SERIAL NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "label" TEXT NOT NULL,
    "createdByContactId" TEXT,
    "sourceFormulaRev" TEXT,
    "panelData" JSONB,
    "fileLink" TEXT,
    "status" "NfpStatus" NOT NULL DEFAULT 'DRAFT',
    "approvalToken" TEXT,
    "approvalTokenExpiresAt" TIMESTAMP(3),
    "sentForApprovalAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "approverName" TEXT,
    "approverNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NfpVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Formula" (
    "id" TEXT NOT NULL,
    "mrpFormulaId" TEXT NOT NULL,
    "rev" TEXT NOT NULL,
    "effectiveDate" TIMESTAMP(3),
    "changedByContactId" TEXT,
    "changeSummary" TEXT,
    "nfpImpact" BOOLEAN NOT NULL DEFAULT false,
    "artworkImpact" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Formula_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rfq" (
    "id" TEXT NOT NULL,
    "ref" SERIAL NOT NULL,
    "vendorId" TEXT NOT NULL,
    "status" "RfqStatus" NOT NULL DEFAULT 'DRAFT',
    "sentAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Rfq_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RfqLine" (
    "id" TEXT NOT NULL,
    "rfqId" TEXT NOT NULL,
    "specId" TEXT NOT NULL,
    "qtyTiers" INTEGER[],
    "notes" TEXT,

    CONSTRAINT "RfqLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL,
    "ref" SERIAL NOT NULL,
    "rfqId" TEXT,
    "vendorId" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" TIMESTAMP(3),
    "accepted" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "fileLink" TEXT,

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteLine" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "specId" TEXT NOT NULL,
    "skuOverride" TEXT,
    "qtyBreak" INTEGER NOT NULL,
    "unitPrice" DECIMAL(12,6) NOT NULL,
    "leadTimeDays" INTEGER,
    "notes" TEXT,

    CONSTRAINT "QuoteLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" TEXT NOT NULL,
    "poNumber" TEXT,
    "poDate" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "vendorId" TEXT NOT NULL,
    "quoteId" TEXT,
    "category" TEXT,
    "status" "PoStatus" NOT NULL DEFAULT 'DRAFT',
    "authorizedBy" TEXT,
    "shipTo" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "POLine" (
    "id" TEXT NOT NULL,
    "poId" TEXT NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "sku" TEXT,
    "specId" TEXT,
    "description" TEXT,
    "qty" INTEGER NOT NULL,
    "unitCost" DECIMAL(12,6) NOT NULL,
    "excluded" BOOLEAN NOT NULL DEFAULT false,
    "exclusionNote" TEXT,
    "lineStatus" "PoLineStatus" NOT NULL DEFAULT 'ORDERED',
    "quotedLeadTimeDays" INTEGER,
    "promisedDate" TIMESTAMP(3),
    "actualShipDate" TIMESTAMP(3),
    "actualReceiptDate" TIMESTAMP(3),
    "qtyReceived" INTEGER,
    "qcStatus" TEXT,
    "location" TEXT,

    CONSTRAINT "POLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromiseLogEntry" (
    "id" TEXT NOT NULL,
    "poLineId" TEXT NOT NULL,
    "previousDate" TIMESTAMP(3),
    "newDate" TIMESTAMP(3) NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,

    CONSTRAINT "PromiseLogEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppAsset" (
    "key" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "filename" TEXT,
    "data" BYTEA NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppAsset_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "NotificationLog" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,
    "payload" JSONB,
    "succeeded" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_inboxProducts" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "_nfpProducts" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "_formulaProducts" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_name_key" ON "Vendor"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Product_gtin_key" ON "Product"("gtin");

-- CreateIndex
CREATE INDEX "Product_baseFlavor_idx" ON "Product"("baseFlavor");

-- CreateIndex
CREATE INDEX "Product_productLine_idx" ON "Product"("productLine");

-- CreateIndex
CREATE INDEX "Product_status_idx" ON "Product"("status");

-- CreateIndex
CREATE UNIQUE INDEX "SkuColor_sku_slot_key" ON "SkuColor"("sku", "slot");

-- CreateIndex
CREATE UNIQUE INDEX "InboxItem_ref_key" ON "InboxItem"("ref");

-- CreateIndex
CREATE UNIQUE INDEX "InboxItem_clientId_key" ON "InboxItem"("clientId");

-- CreateIndex
CREATE INDEX "InboxItem_status_idx" ON "InboxItem"("status");

-- CreateIndex
CREATE INDEX "InboxItem_createdAt_idx" ON "InboxItem"("createdAt");

-- CreateIndex
CREATE INDEX "ArtworkVersion_stage_idx" ON "ArtworkVersion"("stage");

-- CreateIndex
CREATE UNIQUE INDEX "ArtworkVersion_sku_version_key" ON "ArtworkVersion"("sku", "version");

-- CreateIndex
CREATE UNIQUE INDEX "NfpVersion_ref_key" ON "NfpVersion"("ref");

-- CreateIndex
CREATE UNIQUE INDEX "NfpVersion_approvalToken_key" ON "NfpVersion"("approvalToken");

-- CreateIndex
CREATE INDEX "NfpVersion_status_idx" ON "NfpVersion"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Formula_mrpFormulaId_rev_key" ON "Formula"("mrpFormulaId", "rev");

-- CreateIndex
CREATE UNIQUE INDEX "Rfq_ref_key" ON "Rfq"("ref");

-- CreateIndex
CREATE UNIQUE INDEX "Quote_ref_key" ON "Quote"("ref");

-- CreateIndex
CREATE INDEX "QuoteLine_specId_qtyBreak_idx" ON "QuoteLine"("specId", "qtyBreak");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_poNumber_key" ON "PurchaseOrder"("poNumber");

-- CreateIndex
CREATE INDEX "PurchaseOrder_status_idx" ON "PurchaseOrder"("status");

-- CreateIndex
CREATE INDEX "POLine_poId_idx" ON "POLine"("poId");

-- CreateIndex
CREATE INDEX "POLine_sku_idx" ON "POLine"("sku");

-- CreateIndex
CREATE INDEX "POLine_lineStatus_idx" ON "POLine"("lineStatus");

-- CreateIndex
CREATE INDEX "PromiseLogEntry_poLineId_idx" ON "PromiseLogEntry"("poLineId");

-- CreateIndex
CREATE INDEX "NotificationLog_kind_sentAt_idx" ON "NotificationLog"("kind", "sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "_inboxProducts_AB_unique" ON "_inboxProducts"("A", "B");

-- CreateIndex
CREATE INDEX "_inboxProducts_B_index" ON "_inboxProducts"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_nfpProducts_AB_unique" ON "_nfpProducts"("A", "B");

-- CreateIndex
CREATE INDEX "_nfpProducts_B_index" ON "_nfpProducts"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_formulaProducts_AB_unique" ON "_formulaProducts"("A", "B");

-- CreateIndex
CREATE INDEX "_formulaProducts_B_index" ON "_formulaProducts"("B");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackagingSpec" ADD CONSTRAINT "PackagingSpec_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_specId_fkey" FOREIGN KEY ("specId") REFERENCES "PackagingSpec"("specId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkuColor" ADD CONSTRAINT "SkuColor_sku_fkey" FOREIGN KEY ("sku") REFERENCES "Product"("sku") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboxItem" ADD CONSTRAINT "InboxItem_loggedById_fkey" FOREIGN KEY ("loggedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboxItem" ADD CONSTRAINT "InboxItem_sourceContactId_fkey" FOREIGN KEY ("sourceContactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboxItem" ADD CONSTRAINT "InboxItem_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArtworkVersion" ADD CONSTRAINT "ArtworkVersion_sku_fkey" FOREIGN KEY ("sku") REFERENCES "Product"("sku") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArtworkVersion" ADD CONSTRAINT "ArtworkVersion_designerContactId_fkey" FOREIGN KEY ("designerContactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArtworkVersion" ADD CONSTRAINT "ArtworkVersion_nfpVersionId_fkey" FOREIGN KEY ("nfpVersionId") REFERENCES "NfpVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArtworkVersion" ADD CONSTRAINT "ArtworkVersion_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NfpVersion" ADD CONSTRAINT "NfpVersion_createdByContactId_fkey" FOREIGN KEY ("createdByContactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Formula" ADD CONSTRAINT "Formula_changedByContactId_fkey" FOREIGN KEY ("changedByContactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rfq" ADD CONSTRAINT "Rfq_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfqLine" ADD CONSTRAINT "RfqLine_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "Rfq"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfqLine" ADD CONSTRAINT "RfqLine_specId_fkey" FOREIGN KEY ("specId") REFERENCES "PackagingSpec"("specId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "Rfq"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteLine" ADD CONSTRAINT "QuoteLine_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteLine" ADD CONSTRAINT "QuoteLine_specId_fkey" FOREIGN KEY ("specId") REFERENCES "PackagingSpec"("specId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "POLine" ADD CONSTRAINT "POLine_poId_fkey" FOREIGN KEY ("poId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "POLine" ADD CONSTRAINT "POLine_sku_fkey" FOREIGN KEY ("sku") REFERENCES "Product"("sku") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "POLine" ADD CONSTRAINT "POLine_specId_fkey" FOREIGN KEY ("specId") REFERENCES "PackagingSpec"("specId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromiseLogEntry" ADD CONSTRAINT "PromiseLogEntry_poLineId_fkey" FOREIGN KEY ("poLineId") REFERENCES "POLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_inboxProducts" ADD CONSTRAINT "_inboxProducts_A_fkey" FOREIGN KEY ("A") REFERENCES "InboxItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_inboxProducts" ADD CONSTRAINT "_inboxProducts_B_fkey" FOREIGN KEY ("B") REFERENCES "Product"("sku") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_nfpProducts" ADD CONSTRAINT "_nfpProducts_A_fkey" FOREIGN KEY ("A") REFERENCES "NfpVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_nfpProducts" ADD CONSTRAINT "_nfpProducts_B_fkey" FOREIGN KEY ("B") REFERENCES "Product"("sku") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_formulaProducts" ADD CONSTRAINT "_formulaProducts_A_fkey" FOREIGN KEY ("A") REFERENCES "Formula"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_formulaProducts" ADD CONSTRAINT "_formulaProducts_B_fkey" FOREIGN KEY ("B") REFERENCES "Product"("sku") ON DELETE CASCADE ON UPDATE CASCADE;
