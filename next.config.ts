import type { NextConfig } from "next";
import * as fs from "fs";
import * as path from "path";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_VERCEL_ENV: process.env.VERCEL_ENV || "development",
  },
  async redirects() {
    return [
      {
        source: "/quiz",
        destination: "/assessment",
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
          { key: "X-DNS-Prefetch-Control", value: "on" },
          {
            key: "Content-Security-Policy-Report-Only",
            value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://f.convertkit.com https://*.kit.com https://va.vercel-scripts.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://yglmlnfsyzsvozxirlpo.supabase.co https://api.stripe.com https://*.kit.com https://n8n.ideatoplan.to; frame-src https://js.stripe.com https://checkout.stripe.com; form-action 'self' https://buy.stripe.com https://checkout.stripe.com; frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
          },
        ],
      },
    ];
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.plugins.push({
        apply: (compiler: any) => {
          compiler.hooks.done.tap("StripeProductionGuard", (stats: any) => {
            const isProduction = process.env.VERCEL_ENV === "production";
            if (!isProduction) return;

            try {
              const chunksDir = path.join(process.cwd(), ".next", "static", "chunks");
              if (!fs.existsSync(chunksDir)) return;

              let hasTestLinks = false;
              const files = fs.readdirSync(chunksDir);

              for (const file of files) {
                if (!file.endsWith(".js")) continue;
                const filePath = path.join(chunksDir, file);
                const content = fs.readFileSync(filePath, "utf-8");
                if (content.includes("buy.stripe.com/test_")) {
                  console.error(
                    `\n❌ PRODUCTION BUILD GUARD FAILED:\n` +
                    `   Found Stripe test links in ${file}\n` +
                    `   VERCEL_ENV is 'production' but bundle contains buy.stripe.com/test_* links\n` +
                    `   This will cause production buyers to use sandbox payment links\n`
                  );
                  hasTestLinks = true;
                  break;
                }
              }

              if (hasTestLinks) {
                throw new Error(
                  "Production bundle contains Stripe sandbox links. Build aborted. " +
                  "Ensure NEXT_PUBLIC_VERCEL_ENV is set to 'production' at build time."
                );
              }
            } catch (err) {
              if ((err as Error).message.includes("Production bundle contains")) {
                throw err;
              }
            }
          });
        },
      });
    }
    return config;
  },
};

export default nextConfig;
