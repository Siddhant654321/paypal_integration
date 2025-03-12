-- Add views column to auctions table with default value of 0
ALTER TABLE "auctions" ADD COLUMN "views" integer NOT NULL DEFAULT 0;
