-- Authentication action tokens and account-deletion lifecycle.
CREATE TYPE "AuthActionTokenType" AS ENUM ('EMAIL_VERIFICATION', 'PASSWORD_RESET');

ALTER TYPE "AuthEventType" ADD VALUE 'EMAIL_VERIFICATION_REQUESTED';
ALTER TYPE "AuthEventType" ADD VALUE 'EMAIL_VERIFIED';
ALTER TYPE "AuthEventType" ADD VALUE 'PASSWORD_RESET_REQUESTED';
ALTER TYPE "AuthEventType" ADD VALUE 'PASSWORD_RESET_COMPLETED';
ALTER TYPE "AuthEventType" ADD VALUE 'DATA_EXPORTED';
ALTER TYPE "AuthEventType" ADD VALUE 'ACCOUNT_DELETION_REQUESTED';

ALTER TABLE "users"
  ADD COLUMN "deletion_requested_at" TIMESTAMPTZ(3),
  ADD COLUMN "purge_after" TIMESTAMPTZ(3);

CREATE TABLE "auth_action_tokens" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "type" "AuthActionTokenType" NOT NULL,
  "token_hash" CHAR(64) NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "used_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "auth_action_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "auth_action_tokens_token_hash_key" ON "auth_action_tokens"("token_hash");
CREATE INDEX "auth_action_tokens_user_id_type_used_at_idx" ON "auth_action_tokens"("user_id", "type", "used_at");
CREATE INDEX "auth_action_tokens_expires_at_idx" ON "auth_action_tokens"("expires_at");
ALTER TABLE "auth_action_tokens" ADD CONSTRAINT "auth_action_tokens_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
