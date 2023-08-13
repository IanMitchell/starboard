-- AlterTable
ALTER TABLE "GuildSetting" ADD COLUMN     "customEmoji" BIGINT[] DEFAULT ARRAY[]::BIGINT[],
ADD COLUMN     "unicodeEmoji" TEXT[] DEFAULT ARRAY['⭐']::TEXT[];

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "reactions" BIGINT[];
