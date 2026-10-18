#!/bin/bash
set -e

echo "=== Complete Alaminn.info Setup Script ==="
echo "Running on remote server: /home/aloedu/alaminn.info_new"

cd /home/aloedu/alaminn.info_new

# ==========================================
# STEP 1: Create .env file
# ==========================================
echo ""
echo "--- Step 1: Creating .env file ---"

cat > .env << 'ENVEOF'
NODE_ENV=production
PORT=3018
DATABASE_URL="mysql://user_alaminn:Alo_Info_2026!@127.0.0.1:3306/db_alaminn"
NEXTAUTH_URL="https://alaminn.info"
NEXT_PUBLIC_SITE_URL="https://alaminn.info"
EMAIL_FROM="noreply@alaminn.info"
EMAIL_REPLY_TO="engr.alaminn@gmail.com"
LOG_LEVEL=error
WHATSAPP_NUMBER="01716609554"
WHATSAPP_INTERNATIONAL_NUMBER="8801716609554"
WHATSAPP_DISPLAY_NUMBER="01716 609 554"
WHATSAPP_BUSINESS_NAME="Al Aminn"
ADMIN_BOOTSTRAP_EMAIL="admin@alaminn.info"
ADMIN_BOOTSTRAP_PASSWORD="Password@123456"
ENVEOF

# Generate secure random secrets
AUTH_SECRET=$(openssl rand -hex 32)
CRON_SECRET=$(openssl rand -hex 32)
HS_SECRET=$(openssl rand -hex 32)
EL_SECRET=$(openssl rand -hex 32)

# Append secrets to .env
echo "AUTH_SECRET=\"$AUTH_SECRET\"" >> .env
echo "CRON_SECRET=\"$CRON_SECRET\"" >> .env
echo "HIGHER_STUDY_REFERRAL_SECRET=\"$HS_SECRET\"" >> .env
echo "ENGLISH_LEARNING_REFERRAL_SECRET=\"$EL_SECRET\"" >> .env

echo ".env created successfully"
cat .env

# ==========================================
# STEP 2: Fix Prisma schema for MySQL
# ==========================================
echo ""
echo "--- Step 2: Fixing Prisma schema for MySQL ---"

# Restore original schema from git
git checkout prisma/schema.prisma

# Change provider from sqlite to mysql
sed -i 's/provider = "sqlite"/provider = "mysql"/' prisma/schema.prisma

# Use Python to properly add @db.Text annotations without merging lines
python3 << 'PYEOF'
import re

with open('prisma/schema.prisma', 'r') as f:
    content = f.read()

# Fields that need @db.Text for MySQL (long text fields)
long_text_fields = [
    'fullDescription', 'shortDescription', 'body', 'summary', 'description',
    'content', 'message', 'notes', 'topic', 'meta', 'value', 'category',
    'tags', 'testType', 'level', 'resourceType', 'htmlContent', 'ipHash'
]

# Process line by line to avoid merging issues
lines = content.split('\n')
new_lines = []

for line in lines:
    modified = False
    for field in long_text_fields:
        # Pattern: optional String? -> add @db.Text at end of line
        # Must not already have @db.Text
        if re.match(rf'^(\s+{field}\s+String\?)', line) and '@db.Text' not in line:
            # Add @db.Text before any trailing whitespace or comments
            line = re.sub(r'^(\s+' + field + r'\s+String\?)(\s*)(\s*.*)$', r'\1 @db.Text\3', line)
            modified = True
            break

        # Pattern: non-optional String -> add @db.Text at end of line
        elif re.match(rf'^(\s+{field}\s+String)(\s*)$', line) and '@db.Text' not in line and '?' not in line.split('String')[0]:
            line = re.sub(r'^(\s+' + field + r'\s+String)(\s*)$', r'\1 @db.Text', line)
            modified = True
            break

    new_lines.append(line)

with open('prisma/schema.prisma', 'w') as f:
    f.write('\n'.join(new_lines))

print("Schema processed successfully")

# Verify the fix
print("\n=== @db.Text fields found ===")
with open('prisma/schema.prisma', 'r') as f:
    schema_content = f.read()
for i, line in enumerate(schema_content.split('\n'), 1):
    if '@db.Text' in line:
        print(f"Line {i}: {line.strip()}")

PYEOF

# ==========================================
# STEP 3: Generate and push schema to MySQL
# ==========================================
echo ""
echo "--- Step 3: Generating Prisma client and pushing to MySQL ---"

npx prisma generate

npx prisma db push

echo "Schema pushed to MySQL successfully"

# ==========================================
# STEP 4: Fix sharp module build issue
# ==========================================
echo ""
echo "--- Step 4: Fixing sharp module build ---"

# Install with optional dependencies included
npm install --include=optional 2>&1 | tail -5

# Try installing sharp with platform-specific flags
npm install --platform=linux --arch=x64 sharp 2>&1 | tail -5 || true

# Install system dependency for sharp (libvips)
apt-get update && apt-get install -y libvips-dev 2>&1 | tail -3 || true

# Rebuild sharp native module
npm rebuild sharp 2>&1 | tail -5 || true

echo "=== Setup Complete ==="
echo ""
echo "Summary of what was done:"
echo "1. .env created with MySQL DATABASE_URL and random secrets"
echo "2. Prisma schema migrated from SQLite to MySQL with @db.Text annotations"
echo "3. Prisma client generated and pushed to MySQL database"
echo "4. Sharp module build attempted with platform-specific flags"
echo ""
echo "Next steps:"
echo "- Run: npm run build to test the build"
echo "- Check: npm audit to review vulnerabilities"
echo "- If sharp still fails, consider using an alternative image library"