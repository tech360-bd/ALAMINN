# SYSTEM INVENTORY - Alaminn.info

## Repository Overview
- **Project Name**: alaminn.info
- **Repository URL**: https://github.com/engralaminn-collab/alaminn.info.git
- **Default Branch**: upload-local-project
- **Latest Commit SHA**: 8025a3b (Create webpack.yml)
- **Local Base Commit**: 34d6277 (Upload complete Alaminn.info project)
- **Working Directory**: /Users/alaminn/Downloads/alaminn.info-upload-local-project
- **Tracked Files**: 695
- **Repository Status**: Clean working tree at audit start

## Core Technology Stack
- **Framework**: Next.js 16.1.3 (App Router, Turbopack build)
- **Language**: TypeScript 5
- **Styling**: Tailwind CSS 4 + custom design tokens
- **ORM**: Prisma 6 (SQLite for dev, MySQL for production)
- **Auth**: Custom HMAC-signed session cookie with 11 roles (RBAC)
- **AI Integration**: z-ai-web-dev-sdk + OpenAI option
- **Messaging**: Meta Cloud API adapter for WhatsApp
- **Email**: Nodemailer SMTP + Resend adapters
- **Testing**: Vitest 4 (241 tests)
- **Runtime**: Node.js (Bun not available in sandbox)
- **Build System**: Next.js standalone output

## Database Schema Overview
- **Total Prisma Models**: 55
- **Core Models**: 25
- **Higher-Study Models**: 18
- **English-Learning Models**: 10
- **Auth/Analytics/Media Models**: Remaining

### Key Model Categories:
1. **Identity & Auth**: User, Contact, Organization
2. **Inquiries & CRM**: Inquiry, Opportunity, Partnership, StudentReferral, Task, Note, NewsletterSubscriber
3. **Content**: Project, BlogPost, Resource, etc.
4. **Higher Study**: University, Course, Scholarship, Research, Supervisor, Resource, etc.
5. **English Learning**: EnglishLearningCourse, EnglishLearningLesson, EnglishLearningQuestion, etc.
6. **AI Features**: AiTask, AiApproval, Prompt, etc.
7. **Audit & Compliance**: Various audit log models
8. **Media & Files**: MediaAsset, etc.

## Existing Services & Integrations
1. **Public Website**: Executive authority platform
2. **Higher Study Advisory Platform**: University/course/scholarship directory with comparison tools
3. **English Learning Platform**: Courses, lessons, practice tests
4. **Private Command Center**: Admin dashboard with CRM, AI workspace, approvals, audit
5. **AI WhatsApp Agent**: Conversational agent on WhatsApp number
6. **Mini-services** (5 independent Bun services):
   - email-worker (SMTP/Resend)
   - audit-worker (audit log writer)
   - health-monitor (uptime + health checks)
   - notification-service (in-app + push notifications)
   - ai-worker (background AI jobs)

## Infrastructure Components
- **Containerization**: Docker support available
- **Process Management**: PM2/systemd/nginx/OpenLiteSpeed options
- **Database**: Development uses SQLite, production targets MySQL/MariaDB
- **Cache**: Not explicitly configured in visible code
- **Search**: Not implemented (potential gap)
- **File Storage**: Local storage with upload handling
- **Real-time Features**: Not visibly implemented
- **CDN**: Not configured (assets served directly)

## Security Features Implemented
- **Authentication**: HMAC-signed session cookies
- **Authorization**: Role-Based Access Control (11 roles)
- **Input Validation**: Zod schemas (via react-hook-form)
- **Output Encoding**: Automatic in React/Next.js
- **Security Headers**: CSP, X-Frame-Options, etc. implemented
- **Rate Limiting**: On sensitive endpoints
- **SQL Injection Protection**: Prisma ORM parameterization
- **Environment Variables**: .env.example with placeholders (no committed secrets)
- **Password Handling**: Hashing (bcrypt implied)

## Missing / To-be-Verified Components
1. **Structural i18n**: next-intl dependency present but not wired
2. **Production Database**: MySQL/MariaDB state not verified from sandbox
3. **External API Credentials**: WhatsApp, Email services need live credentials
4. **Search Functionality**: No visible search implementation
5. **Analytics**: Basic tracking present, advanced analytics not verified
6. **Backup Systems**: Scripts present but execution not verified
7. **Monitoring**: Health checks present, full observability not verified
8. **CI/CD**: GitHub Actions present but broken (auto-generated webpack.yml)
9. **Telegram Bot Integration**: Not present in codebase
10. **Social Media Publishing**: Only profile links exist, no publishing APIs
11. **n8n Workflows**: Not present in repository
12. **Bangla CMS Content**: next-intl not wired for structural Bangla support

## File Structure Summary
```
src/
├── app/                 # Next.js App Router (public site + /admin + /api)
├── components/          # UI components (site sections, admin UI, etc.)
├── lib/                 # Core libraries (auth, rbac, db, integrations)
├── hooks/               # React hooks
├── fonts/               # Self-hosted fonts (network-independent)
├── instrumentation.ts   # OpenTelemetry/Sentry setup
└── proxy.ts             # Next.js middleware replacement

prisma/                  # Database schema, seed, migrations
mini-services/           # 5 independent Bun worker services
deploy/                  # Deployment configurations (systemd, pm2, etc.)
scripts/                 # Utility scripts (backup, security tests, etc.)
tests/                   # Vitest test files
docs/                    # Documentation
public/                  # Static assets (images, favicon, etc.)
```

## Environment Configuration
- **.env.template**: Contains placeholders for all required variables
- **Required Variables**: DATABASE_URL, AUTH_SECRET, SMTP/Resend keys, WhatsApp credentials, etc.
- **Current Status**: No .env committed (correct), .env.example provides template