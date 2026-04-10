#!/usr/bin/env bash
set -e

# ── StarHub Deployment Script ────────────────────────────────
# Builds the Next.js static export and packages everything
# needed for Cloudflare Pages deployment into a zip file.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

echo "🚀 StarHub — Build & Package for Cloudflare Pages"
echo "=================================================="
echo ""

# ── Step 1: Install dependencies if needed ───────────────────
if [ ! -d "node_modules" ]; then
  echo "📦 Installing dependencies..."
  npm install
  echo ""
fi

# ── Step 2: Build Next.js static export ──────────────────────
echo "🔨 Building Next.js static export..."
npm run build
echo ""

# Verify build output
if [ ! -d "out" ]; then
  echo "❌ Build failed: /out directory not found"
  exit 1
fi
echo "✅ Build complete — /out directory ready"
echo ""

# ── Step 3: Verify required files exist ──────────────────────
echo "🔍 Verifying required files..."

if [ ! -d "functions" ]; then
  echo "❌ Missing: functions/ directory"
  exit 1
fi

if [ ! -f "wrangler.toml" ]; then
  echo "❌ Missing: wrangler.toml"
  exit 1
fi

if [ ! -f "functions/api/_schema.sql" ]; then
  echo "❌ Missing: functions/api/_schema.sql"
  exit 1
fi

echo "✅ All required files present"
echo ""

# ── Step 4: Create deployment zip ────────────────────────────
ZIP_NAME="starhub-deploy.zip"

echo "📦 Creating deployment package: $ZIP_NAME"

# Remove old zip if it exists
rm -f "$ZIP_NAME"

zip -r "$ZIP_NAME" \
  out/ \
  functions/ \
  wrangler.toml \
  -x "functions/node_modules/*" "out/.next/*"

echo ""
echo "✅ Package created: $ZIP_NAME"
echo "   Size: $(du -h "$ZIP_NAME" | cut -f1)"
echo ""

# ── Step 5: Print deployment instructions ────────────────────
echo "=================================================="
echo "📋 Deployment Instructions"
echo "=================================================="
echo ""
echo "1. Create D1 database:"
echo "   npx wrangler d1 create starhub-db"
echo ""
echo "2. Update wrangler.toml with the database_id from step 1"
echo ""
echo "3. Apply database schema:"
echo "   npx wrangler d1 execute starhub-db --file=functions/api/_schema.sql"
echo ""
echo "4. Create KV namespace:"
echo "   npx wrangler kv:namespace create KV"
echo ""
echo "5. Update wrangler.toml with the KV namespace id from step 4"
echo ""
echo "6. Deploy to Cloudflare Pages:"
echo "   npx wrangler pages deploy out"
echo ""
echo "7. Set secrets (via CLI or Cloudflare dashboard):"
echo "   npx wrangler pages secret put JWT_SECRET"
echo "   npx wrangler pages secret put OPENAI_API_KEY"
echo "   npx wrangler pages secret put DEEPSEEK_API_KEY"
echo "   npx wrangler pages secret put MOONSHOT_API_KEY"
echo ""
echo "=================================================="
echo "🎉 Done! Your deployment package is ready."
echo "=================================================="
