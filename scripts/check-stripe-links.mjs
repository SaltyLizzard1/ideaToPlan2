#!/usr/bin/env node
import { readdirSync, readFileSync } from "fs";
import { join } from "path";

const isProduction = process.env.VERCEL_ENV === "production";
const chunksDir = join(process.cwd(), ".next", "static", "chunks");

try {
  const files = readdirSync(chunksDir);
  let foundTestLinks = false;
  let filesWithTestLinks = [];

  for (const file of files) {
    if (!file.endsWith(".js")) continue;
    try {
      const filePath = join(chunksDir, file);
      const content = readFileSync(filePath, "utf-8");
      if (content.includes("buy.stripe.com/test_")) {
        foundTestLinks = true;
        filesWithTestLinks.push(file);
      }
    } catch (err) {
      if (isProduction) {
        console.error(`❌ Error reading ${file}:`, err.message);
        process.exit(1);
      }
    }
  }

  if (foundTestLinks) {
    if (isProduction) {
      console.error(
        "\n❌ PRODUCTION BUILD GUARD FAILED\n" +
        "   Found Stripe test links in production bundle:\n" +
        filesWithTestLinks.map((f) => `   - ${f}`).join("\n") +
        "\n   This would cause production buyers to use sandbox payment links.\n" +
        "   Verify NEXT_PUBLIC_VERCEL_ENV is set to 'production' at build time.\n"
      );
      process.exit(1);
    } else {
      console.warn(
        "⚠️  Found Stripe test links in bundle (non-production build, allowed):\n" +
        filesWithTestLinks.map((f) => `   - ${f}`).join("\n")
      );
    }
  } else if (isProduction) {
    console.log("✓ Stripe link guard passed: no test links in production bundle");
  }
} catch (err) {
  console.error("❌ Stripe link guard failed with error:", err.message);
  process.exit(1);
}
