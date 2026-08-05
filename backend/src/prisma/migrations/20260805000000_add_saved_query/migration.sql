-- CreateTable
CREATE TABLE "SavedQuery" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "jql" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "listColumns" JSONB NOT NULL DEFAULT '[]',
    "tabs" JSONB NOT NULL DEFAULT '[]',
    "autresVisibleToUser" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedQuery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SavedQuery_position_idx" ON "SavedQuery"("position");
