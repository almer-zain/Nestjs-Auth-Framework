# Diff Details

Date : 2026-09-05 11:47:40

Directory /home/generalegg/Project-P/blog-be/src

Total : 49 files,  793 codes, 262 comments, 145 blanks, all 1200 lines

[Summary](results.md) / [Details](details.md) / [Diff Summary](diff.md) / Diff Details

## Files
| filename | language | code | comment | blank | total |
| :--- | :--- | ---: | ---: | ---: | ---: |
| [src/app.module.ts](/src/app.module.ts) | TypeScript | 15 | -1 | 1 | 15 |
| [src/common/decorator/current-user.decorator.ts](/src/common/decorator/current-user.decorator.ts) | TypeScript | 12 | 1 | 3 | 16 |
| [src/common/decorator/permissions.decorator.ts](/src/common/decorator/permissions.decorator.ts) | TypeScript | -4 | -1 | -1 | -6 |
| [src/common/decorator/sanitize.decorator.ts](/src/common/decorator/sanitize.decorator.ts) | TypeScript | -11 | 0 | -1 | -12 |
| [src/common/entities/base-account.abstract.ts](/src/common/entities/base-account.abstract.ts) | TypeScript | 16 | 9 | 3 | 28 |
| [src/common/filters/all-exceptions.filter.ts](/src/common/filters/all-exceptions.filter.ts) | TypeScript | 38 | 3 | 8 | 49 |
| [src/common/interceptors/logging.interceptor.ts](/src/common/interceptors/logging.interceptor.ts) | TypeScript | 29 | 1 | 6 | 36 |
| [src/common/services/cache-invalidation.service.ts](/src/common/services/cache-invalidation.service.ts) | TypeScript | 14 | 3 | 3 | 20 |
| [src/common/types/jwt-types.ts](/src/common/types/jwt-types.ts) | TypeScript | 1 | 0 | 0 | 1 |
| [src/config/namespaces/oauth.config.ts](/src/config/namespaces/oauth.config.ts) | TypeScript | 8 | 1 | 2 | 11 |
| [src/config/strategies/google.strategy.ts](/src/config/strategies/google.strategy.ts) | TypeScript | 34 | 5 | 5 | 44 |
| [src/config/strategies/jwt-access.strategy.ts](/src/config/strategies/jwt-access.strategy.ts) | TypeScript | 2 | 1 | 1 | 4 |
| [src/config/typeorm.config.ts](/src/config/typeorm.config.ts) | TypeScript | 17 | 3 | 6 | 26 |
| [src/main.ts](/src/main.ts) | TypeScript | 7 | 2 | 3 | 12 |
| [src/migrations/1781622946540-InitialSetup.ts](/src/migrations/1781622946540-InitialSetup.ts) | TypeScript | 112 | 0 | 4 | 116 |
| [src/modules/admins/admins-cleanup.cron.ts](/src/modules/admins/admins-cleanup.cron.ts) | TypeScript | 24 | 2 | 6 | 32 |
| [src/modules/admins/admins.controller.ts](/src/modules/admins/admins.controller.ts) | TypeScript | 5 | 0 | 1 | 6 |
| [src/modules/admins/admins.module.ts](/src/modules/admins/admins.module.ts) | TypeScript | 1 | 0 | 0 | 1 |
| [src/modules/admins/admins.service.ts](/src/modules/admins/admins.service.ts) | TypeScript | 61 | 41 | 11 | 113 |
| [src/modules/admins/dto/update-admin.dto.ts](/src/modules/admins/dto/update-admin.dto.ts) | TypeScript | -2 | 0 | 0 | -2 |
| [src/modules/auth/auth.controller.ts](/src/modules/auth/auth.controller.ts) | TypeScript | -1 | 0 | 0 | -1 |
| [src/modules/auth/auth.module.ts](/src/modules/auth/auth.module.ts) | TypeScript | 11 | 0 | 0 | 11 |
| [src/modules/auth/auth.service.ts](/src/modules/auth/auth.service.ts) | TypeScript | 32 | 44 | 1 | 77 |
| [src/modules/auth/captcha.service.ts](/src/modules/auth/captcha.service.ts) | TypeScript | -2 | 2 | 0 | 0 |
| [src/modules/auth/device.service.ts](/src/modules/auth/device.service.ts) | TypeScript | -1 | 1 | 1 | 1 |
| [src/modules/auth/dto/register.dto.ts](/src/modules/auth/dto/register.dto.ts) | TypeScript | -6 | 0 | -1 | -7 |
| [src/modules/auth/entities/account-device.entity.ts](/src/modules/auth/entities/account-device.entity.ts) | TypeScript | 2 | 0 | 0 | 2 |
| [src/modules/health/health.controller.ts](/src/modules/health/health.controller.ts) | TypeScript | 34 | 5 | 5 | 44 |
| [src/modules/health/health.module.ts](/src/modules/health/health.module.ts) | TypeScript | 2 | 0 | 0 | 2 |
| [src/modules/permissions/decorators/permissions.decorator.ts](/src/modules/permissions/decorators/permissions.decorator.ts) | TypeScript | 4 | 4 | 3 | 11 |
| [src/modules/permissions/dto/create-permission.dto.ts](/src/modules/permissions/dto/create-permission.dto.ts) | TypeScript | -3 | 0 | 0 | -3 |
| [src/modules/permissions/entities/permission.entity.ts](/src/modules/permissions/entities/permission.entity.ts) | TypeScript | 10 | 1 | 2 | 13 |
| [src/modules/permissions/guards/permissions.guard.ts](/src/modules/permissions/guards/permissions.guard.ts) | TypeScript | 11 | 0 | 2 | 13 |
| [src/modules/permissions/permissions.controller.ts](/src/modules/permissions/permissions.controller.ts) | TypeScript | 9 | 0 | 1 | 10 |
| [src/modules/permissions/permissions.module.ts](/src/modules/permissions/permissions.module.ts) | TypeScript | 4 | 0 | 0 | 4 |
| [src/modules/permissions/permissions.service.ts](/src/modules/permissions/permissions.service.ts) | TypeScript | 29 | 42 | 6 | 77 |
| [src/modules/roles/decorators/roles.decorator.ts](/src/modules/roles/decorators/roles.decorator.ts) | TypeScript | 3 | 0 | 2 | 5 |
| [src/modules/roles/entities/role.entity.ts](/src/modules/roles/entities/role.entity.ts) | TypeScript | 9 | 0 | 3 | 12 |
| [src/modules/roles/guards/roles.guard.ts](/src/modules/roles/guards/roles.guard.ts) | TypeScript | 38 | 3 | 10 | 51 |
| [src/modules/roles/roles.controller.ts](/src/modules/roles/roles.controller.ts) | TypeScript | 9 | 0 | 1 | 10 |
| [src/modules/roles/roles.module.ts](/src/modules/roles/roles.module.ts) | TypeScript | 5 | 0 | 0 | 5 |
| [src/modules/roles/roles.service.ts](/src/modules/roles/roles.service.ts) | TypeScript | 40 | 47 | 9 | 96 |
| [src/modules/users/dto/create-user.dto.ts](/src/modules/users/dto/create-user.dto.ts) | TypeScript | 26 | 0 | 3 | 29 |
| [src/modules/users/users-cleanup.cron.ts](/src/modules/users/users-cleanup.cron.ts) | TypeScript | 30 | 6 | 7 | 43 |
| [src/modules/users/users.controller.ts](/src/modules/users/users.controller.ts) | TypeScript | 15 | -1 | 1 | 15 |
| [src/modules/users/users.module.ts](/src/modules/users/users.module.ts) | TypeScript | 1 | 0 | 0 | 1 |
| [src/modules/users/users.service.ts](/src/modules/users/users.service.ts) | TypeScript | 69 | -1 | 16 | 84 |
| [src/utils/access-control.util.ts](/src/utils/access-control.util.ts) | TypeScript | 33 | 11 | 11 | 55 |
| [src/utils/sanitize.util.ts](/src/utils/sanitize.util.ts) | TypeScript | 1 | 28 | 1 | 30 |

[Summary](results.md) / [Details](details.md) / [Diff Summary](diff.md) / Diff Details