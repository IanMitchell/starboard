-- CreateTable
CREATE TABLE "GuildSetting" (
    "guildId" BIGINT NOT NULL,
    "log" BIGINT NOT NULL DEFAULT 0,
    "amount" BIGINT NOT NULL DEFAULT 7,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuildSetting_pkey" PRIMARY KEY ("guildId")
);

-- CreateTable
CREATE TABLE "ChannelSetting" (
    "channelId" BIGINT NOT NULL,
    "guildSettingGuildId" BIGINT NOT NULL,
    "visible" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChannelSetting_pkey" PRIMARY KEY ("channelId")
);

-- CreateTable
CREATE TABLE "Message" (
    "messageId" BIGINT NOT NULL,
    "guildId" BIGINT NOT NULL,
    "channelId" BIGINT NOT NULL,
    "crosspostId" BIGINT NOT NULL,
    "count" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("messageId")
);

-- CreateTable
CREATE TABLE "BlockedMessage" (
    "messageId" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlockedMessage_pkey" PRIMARY KEY ("messageId")
);

-- CreateTable
CREATE TABLE "StarCount" (
    "id" SERIAL NOT NULL,
    "userId" BIGINT NOT NULL,
    "guildId" BIGINT NOT NULL,
    "amount" INTEGER NOT NULL,

    CONSTRAINT "StarCount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Message_crosspostId_key" ON "Message"("crosspostId");

-- CreateIndex
CREATE INDEX "Message_channelId_messageId_idx" ON "Message"("channelId", "messageId");

-- CreateIndex
CREATE INDEX "StarCount_userId_guildId_idx" ON "StarCount"("userId", "guildId");

-- CreateIndex
CREATE INDEX "StarCount_amount_idx" ON "StarCount"("amount");

-- CreateIndex
CREATE UNIQUE INDEX "StarCount_userId_guildId_key" ON "StarCount"("userId", "guildId");

-- AddForeignKey
ALTER TABLE "ChannelSetting" ADD CONSTRAINT "ChannelSetting_guildSettingGuildId_fkey" FOREIGN KEY ("guildSettingGuildId") REFERENCES "GuildSetting"("guildId") ON DELETE RESTRICT ON UPDATE CASCADE;
