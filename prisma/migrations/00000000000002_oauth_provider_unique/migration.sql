-- DropIndex
DROP INDEX "users_provider_provider_id_idx";

-- CreateIndex
CREATE UNIQUE INDEX "users_provider_provider_id_key" ON "users"("provider", "provider_id");

