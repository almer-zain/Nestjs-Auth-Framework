# NestJS Auth Framework

![License](https://img.shields.io/badge/license-UNLICENSED-red)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7.3-3178C6?logo=typescript)
![NestJS](https://img.shields.io/badge/NestJS-11.x-E0234E?logo=nestjs)
![PostgreSQL](https://img.shields.io/badge/DB-PostgreSQL-336791?logo=postgresql)

This project is a secure NestJS backend for user and admin identity management in a blog or multi-user application. It combines JWT authentication, role-based access control, MFA, password recovery, and operational monitoring into a single production-ready API foundation.

## Description

This repository contains a modular backend built on NestJS and TypeORM for managing authentication, authorization, and user lifecycle workflows. It includes support for user/admin accounts, permission-based authorization, soft-deletes, Google OAuth support, TOTP-based two-factor authentication, email recovery flows, Redis-backed caching and throttling, and infrastructure health checks. The app is designed to be secure, observable, and ready for deployment behind a production environment.

## Core Features

- User and admin registration and login
- JWT access and refresh token flows
- Role-based access control with permission guards
- TOTP-based two-factor authentication
- Password reset and recovery emails
- Device-aware account security checks
- User/admin soft-delete and restore lifecycle
- Support for paginated queries and access control validation
- Global request validation and security hardening
- Swagger API docs in development mode
- Redis cache and throttling support
- Health checks for database, mailer, storage, frontend reachability, and Redis
- Structured logging with Pino and graceful shutdown support

## Architecture & Tech Stack

### Tech Stack

| Category | Technology |
| --- | --- |
| Runtime | Node.js 18+ |
| Framework | NestJS 11 |
| Language | TypeScript 5.7.3 |
| Persistence | TypeORM + PostgreSQL/MySQL-compatible drivers |
| Authentication | Passport, JWT, Google OAuth, otplib (TOTP) |
| Caching & Rate Limiting | Redis, cache-manager, @nestjs/throttler |
| Email | Nodemailer, @nestjs-modules/mailer, Handlebars templates |
| Validation | class-validator, class-transformer |
| Logging | nestjs-pino, Pino |
| Security | Helmet, CORS, compression, hpp, cookie-parser |
| Testing | Jest, Supertest |
| API Documentation | Swagger |

### System Architecture

```text
Client / Frontend
        |
        v
NestJS API Server
  ├── Auth Module
  ├── Users Module
  ├── Admins Module
  ├── Roles Module
  ├── Permissions Module
  ├── Health Module
  └── Mail Service
        |
        ├── PostgreSQL / MySQL (TypeORM)
        ├── Redis (cache + throttling)
        └── SMTP Mail Server
```

The application bootstrap and global security setup are defined in [src/main.ts](src/main.ts), while the app module wiring and configuration are in [src/app.module.ts](src/app.module.ts).

## Prerequisites & System Requirements

| Requirement | Minimum / Recommended |
| --- | --- |
| Node.js | 18 LTS or newer |
| npm | 9.x or newer |
| Database | PostgreSQL 14+ or MySQL-compatible database |
| Redis | 7.x recommended when `USE_REDIS=true` |
| Mail service | SMTP provider or Mailtrap-like sandbox |
| OS | Linux, macOS, or Windows with a compatible Node environment |

This project does not include Docker or Kubernetes manifests in the workspace, so it is designed to run as a standard Node.js/NestJS service.

## Getting Started

### 1. Clone the repository

```bash
git clone <repository-url>
cd blog-be
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create a `.env` file from the project example template:

```bash
cp .example.env .env
```

Then update the values for your local or deployment environment.

### 4. Run database migrations

```bash
npm run migration:run
```

### 5. Start the application

Development mode:

```bash
npm run start:dev
```

Production build:

```bash
npm run build
npm run start:prod
```

## Environment Variables

The application validates required configuration in [src/app.module.ts](src/app.module.ts). The exact template is provided in [.example.env](.example.env).

```env
# APP CONFIGURATION
APP_NAME="Auth Service"
NODE_ENV=development
PORT=3000
FRONTEND_URL="http://localhost:3000"

# SECURITY / JWT
JWT_ACCESS_SECRET="generate_a_long_random_string_here"
JWT_ACCESS_EXPIRY="15m"
JWT_REFRESH_SECRET="generate_another_long_random_string_here"
JWT_REFRESH_EXPIRY="7d"

# DATABASE (PostgreSQL)
DB_TYPE=postgres
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_NAME=auth_service
DB_SYNCHRONIZE=false

# RATE LIMITER & CACHE
RATELIMIT_TTL=60000
RATELIMIT_MAX=10
CACHE_TTL=600

# REDIS
USE_REDIS=true
REDIS_HOST=localhost
REDIS_PORT=6379

# MAIL (SMTP)
MAIL_HOST=sandbox.smtp.mailtrap.io
MAIL_PORT=2525
MAIL_USER=
MAIL_PASS=
MAIL_FROM="Your Company <noreply@your-company.com>"
SMTP_SECURE=false
SUPPORT_EMAIL="support@your-company.com"
EMAIL_EXPIRY=900000

# COMPANY INFO
COMPANY_NAME="Your Company"
COPYRIGHT_YEAR=2024

# CAPTCHA
CAPTCHA_ENABLED=false
CAPTCHA_SECRET="1x0000000000000000000000000000000AA"
```

Optional Google OAuth variables are supported through the config layer in [src/config/namespaces/oauth.config.ts](src/config/namespaces/oauth.config.ts):

```env
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_CALLBACK_URL=...
```

## Usage Examples

### Run the app in development

```bash
npm run start:dev
```

### Build the project

```bash
npm run build
```

### Run the built app

```bash
npm run start:prod
```

### Health check

```bash
curl http://localhost:3000/health
```

### Register a new user

```bash
curl -X POST http://localhost:3000/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "username": "user1",
    "displayName": "User One",
    "password": "StrongPassword123!"
  }'
```

### Login

```bash
curl -X POST http://localhost:3000/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "StrongPassword123!",
    "captchaToken": "optional-token"
  }'
```

### Swagger UI

Swagger is activated in non-production environments and is available at:

```text
http://localhost:3000/api
```

## Testing

The project includes Jest test scripts configured in [package.json](package.json).

| Command | Purpose |
| --- | --- |
| `npm test` | Run unit tests |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:cov` | Run tests with coverage |
| `npm run test:e2e` | Run end-to-end tests |
| `npm run lint` | Run ESLint checks |

Example:

```bash
npm test
npm run test:e2e
npm run lint
```

## Deployment

This repository does not include a Dockerfile or Kubernetes manifest. The app is intended to be deployed as a standard Node.js service behind a reverse proxy or application gateway.

Typical production deployment flow:

```bash
npm install
npm run build
NODE_ENV=production npm run start:prod
```

Recommended production checklist:

- Set strong JWT secrets and rotate them periodically
- Keep `FRONTEND_URL` aligned with your allowed frontend origin
- Configure a managed PostgreSQL or MySQL database
- Run Redis when `USE_REDIS=true`
- Provide SMTP credentials for password reset and mail flows
- Ensure secure reverse-proxy TLS termination

## Contributing

Contributions are welcome.

1. Fork the repository
2. Create a feature branch:

```bash
git checkout -b feature/my-change
```

3. Make your changes with focused commits
4. Run relevant tests and lint checks
5. Open a pull request with a clear description and validation steps

### Contribution Guidelines

- Follow the existing NestJS and TypeScript conventions
- Keep services focused and modular
- Add or update tests for bug fixes and new features
- Avoid committing secrets or environment files
- Review security-sensitive changes carefully

## License

This project is currently marked as UNLICENSED in [package.json](package.json). That means there is no explicit open-source license declared in the repository as-is.

## Project Structure

```text
blog-be/
├── .example.env
├── .gitignore
├── README.md
├── eslint.config.mjs
├── nest-cli.json
├── package-lock.json
├── package.json
├── tsconfig.json
├── tsconfig.build.json
├── src/
│   ├── app.module.ts
│   ├── main.ts
│   ├── common/
│   │   ├── decorator/
│   │   ├── dto/
│   │   ├── entities/
│   │   ├── filters/
│   │   ├── interceptors/
│   │   ├── services/
│   │   └── types/
│   ├── config/
│   │   ├── namespaces/
│   │   ├── strategies/
│   │   └── typeorm.config.ts
│   ├── migrations/
│   ├── modules/
│   │   ├── admins/
│   │   ├── auth/
│   │   ├── health/
│   │   ├── mail/
│   │   ├── permissions/
│   │   ├── roles/
│   │   └── users/
│   └── utils/
├── test/
│   ├── helpers/
│   └── mocks/
└── .vscode/
```

## Summary

This repository is a production-minded NestJS backend for secure identity, authorization, and user management workflows. It provides a strong foundation for multi-user applications, blog platforms, and admin systems with the right balance of security, maintainability, and operational monitoring.
