-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'DISABLED', 'DELETION_PENDING');

-- CreateEnum
CREATE TYPE "SessionRevocationReason" AS ENUM ('LOGOUT', 'LOGOUT_ALL', 'TOKEN_REUSE', 'PASSWORD_CHANGED', 'ACCOUNT_DISABLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AuthEventType" AS ENUM ('REGISTERED', 'LOGIN_SUCCEEDED', 'LOGIN_FAILED', 'TOKEN_REFRESHED', 'TOKEN_REUSE_DETECTED', 'LOGOUT', 'LOGOUT_ALL', 'ACCESS_REJECTED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "email_verified_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "device_name" VARCHAR(120),
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "last_used_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(3),
    "revocation_reason" "SessionRevocationReason",
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "replaced_by_token_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_security_events" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "session_id" UUID,
    "type" "AuthEventType" NOT NULL,
    "ip_hash" CHAR(64),
    "user_agent_hash" CHAR(64),
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_security_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "auth_sessions_user_id_revoked_at_idx" ON "auth_sessions"("user_id", "revoked_at");

-- CreateIndex
CREATE INDEX "auth_sessions_expires_at_idx" ON "auth_sessions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_replaced_by_token_id_key" ON "refresh_tokens"("replaced_by_token_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_session_id_revoked_at_idx" ON "refresh_tokens"("session_id", "revoked_at");

-- CreateIndex
CREATE INDEX "refresh_tokens_expires_at_idx" ON "refresh_tokens"("expires_at");

-- CreateIndex
CREATE INDEX "auth_security_events_user_id_created_at_idx" ON "auth_security_events"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "auth_security_events_session_id_created_at_idx" ON "auth_security_events"("session_id", "created_at");

-- CreateIndex
CREATE INDEX "auth_security_events_type_created_at_idx" ON "auth_security_events"("type", "created_at");

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "auth_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_replaced_by_token_id_fkey" FOREIGN KEY ("replaced_by_token_id") REFERENCES "refresh_tokens"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_security_events" ADD CONSTRAINT "auth_security_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_security_events" ADD CONSTRAINT "auth_security_events_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "auth_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
