-- CreateTable
CREATE TABLE "tenant_registry" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "schema_name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "plan" TEXT NOT NULL DEFAULT 'FREE',
    "clerk_org_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_registry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenant_registry_slug_key" ON "tenant_registry"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_registry_schema_name_key" ON "tenant_registry"("schema_name");

