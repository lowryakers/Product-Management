-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "gtinValid" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "SavedView" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "table" TEXT NOT NULL DEFAULT 'products',
    "query" TEXT NOT NULL,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedView_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SavedView_userId_table_idx" ON "SavedView"("userId", "table");

-- CreateIndex
CREATE UNIQUE INDEX "SavedView_userId_table_name_key" ON "SavedView"("userId", "table", "name");

-- AddForeignKey
ALTER TABLE "SavedView" ADD CONSTRAINT "SavedView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
