# Details

Date : 2026-09-05 11:47:40

Directory /home/generalegg/Project-P/blog-be/src

Total : 79 files,  3298 codes, 497 comments, 614 blanks, all 4409 lines

[Summary](results.md) / Details / [Diff Summary](diff.md) / [Diff Details](diff-details.md)

## Files
| filename | language | code | comment | blank | total |
| :--- | :--- | ---: | ---: | ---: | ---: |
| [src/app.module.ts](/src/app.module.ts) | TypeScript | 195 | 21 | 20 | 236 |
| [src/common/decorator/current-user.decorator.ts](/src/common/decorator/current-user.decorator.ts) | TypeScript | 12 | 1 | 3 | 16 |
| [src/common/dto/pagination.dto.ts](/src/common/dto/pagination.dto.ts) | TypeScript | 18 | 0 | 3 | 21 |
| [src/common/entities/base-account.abstract.ts](/src/common/entities/base-account.abstract.ts) | TypeScript | 60 | 13 | 17 | 90 |
| [src/common/filters/all-exceptions.filter.ts](/src/common/filters/all-exceptions.filter.ts) | TypeScript | 38 | 3 | 8 | 49 |
| [src/common/interceptors/logging.interceptor.ts](/src/common/interceptors/logging.interceptor.ts) | TypeScript | 29 | 1 | 6 | 36 |
| [src/common/services/cache-invalidation.service.ts](/src/common/services/cache-invalidation.service.ts) | TypeScript | 14 | 3 | 3 | 20 |
| [src/common/types/jwt-types.ts](/src/common/types/jwt-types.ts) | TypeScript | 13 | 0 | 2 | 15 |
| [src/config/namespaces/app.config.ts](/src/config/namespaces/app.config.ts) | TypeScript | 6 | 0 | 2 | 8 |
| [src/config/namespaces/jwt.config.ts](/src/config/namespaces/jwt.config.ts) | TypeScript | 7 | 0 | 2 | 9 |
| [src/config/namespaces/oauth.config.ts](/src/config/namespaces/oauth.config.ts) | TypeScript | 8 | 1 | 2 | 11 |
| [src/config/strategies/google.strategy.ts](/src/config/strategies/google.strategy.ts) | TypeScript | 34 | 5 | 5 | 44 |
| [src/config/strategies/jwt-access.strategy.ts](/src/config/strategies/jwt-access.strategy.ts) | TypeScript | 30 | 1 | 4 | 35 |
| [src/config/strategies/jwt-refresh.strategy.ts](/src/config/strategies/jwt-refresh.strategy.ts) | TypeScript | 33 | 2 | 6 | 41 |
| [src/config/typeorm.config.ts](/src/config/typeorm.config.ts) | TypeScript | 17 | 3 | 6 | 26 |
| [src/main.ts](/src/main.ts) | TypeScript | 98 | 18 | 23 | 139 |
| [src/migrations/1781622946540-InitialSetup.ts](/src/migrations/1781622946540-InitialSetup.ts) | TypeScript | 112 | 0 | 4 | 116 |
| [src/modules/admins/admins-cleanup.cron.ts](/src/modules/admins/admins-cleanup.cron.ts) | TypeScript | 24 | 2 | 6 | 32 |
| [src/modules/admins/admins.controller.spec.ts](/src/modules/admins/admins.controller.spec.ts) | TypeScript | 16 | 0 | 5 | 21 |
| [src/modules/admins/admins.controller.ts](/src/modules/admins/admins.controller.ts) | TypeScript | 81 | 0 | 8 | 89 |
| [src/modules/admins/admins.module.ts](/src/modules/admins/admins.module.ts) | TypeScript | 13 | 0 | 2 | 15 |
| [src/modules/admins/admins.service.spec.ts](/src/modules/admins/admins.service.spec.ts) | TypeScript | 14 | 0 | 5 | 19 |
| [src/modules/admins/admins.service.ts](/src/modules/admins/admins.service.ts) | TypeScript | 160 | 47 | 34 | 241 |
| [src/modules/admins/dto/create-admin.dto.ts](/src/modules/admins/dto/create-admin.dto.ts) | TypeScript | 41 | 0 | 6 | 47 |
| [src/modules/admins/dto/update-admin.dto.ts](/src/modules/admins/dto/update-admin.dto.ts) | TypeScript | 3 | 0 | 2 | 5 |
| [src/modules/admins/entities/admin.entity.ts](/src/modules/admins/entities/admin.entity.ts) | TypeScript | 5 | 2 | 2 | 9 |
| [src/modules/auth/auth.controller.spec.ts](/src/modules/auth/auth.controller.spec.ts) | TypeScript | 16 | 0 | 5 | 21 |
| [src/modules/auth/auth.controller.ts](/src/modules/auth/auth.controller.ts) | TypeScript | 69 | 0 | 9 | 78 |
| [src/modules/auth/auth.module.ts](/src/modules/auth/auth.module.ts) | TypeScript | 22 | 0 | 2 | 24 |
| [src/modules/auth/auth.service.spec.ts](/src/modules/auth/auth.service.spec.ts) | TypeScript | 14 | 0 | 5 | 19 |
| [src/modules/auth/auth.service.ts](/src/modules/auth/auth.service.ts) | TypeScript | 246 | 72 | 57 | 375 |
| [src/modules/auth/captcha.service.ts](/src/modules/auth/captcha.service.ts) | TypeScript | 49 | 7 | 11 | 67 |
| [src/modules/auth/device.service.ts](/src/modules/auth/device.service.ts) | TypeScript | 69 | 10 | 10 | 89 |
| [src/modules/auth/dto/login.dto.ts](/src/modules/auth/dto/login.dto.ts) | TypeScript | 26 | 0 | 6 | 32 |
| [src/modules/auth/dto/register.dto.ts](/src/modules/auth/dto/register.dto.ts) | TypeScript | 32 | 0 | 5 | 37 |
| [src/modules/auth/dto/reset-password.dto.ts](/src/modules/auth/dto/reset-password.dto.ts) | TypeScript | 26 | 1 | 5 | 32 |
| [src/modules/auth/dto/verify-2fa.dto.ts](/src/modules/auth/dto/verify-2fa.dto.ts) | TypeScript | 15 | 1 | 4 | 20 |
| [src/modules/auth/entities/account-device.entity.ts](/src/modules/auth/entities/account-device.entity.ts) | TypeScript | 32 | 0 | 11 | 43 |
| [src/modules/auth/entities/auth.entity.ts](/src/modules/auth/entities/auth.entity.ts) | TypeScript | 1 | 0 | 1 | 2 |
| [src/modules/auth/guard/jwt-auth.guard.ts](/src/modules/auth/guard/jwt-auth.guard.ts) | TypeScript | 4 | 14 | 3 | 21 |
| [src/modules/health/health.controller.ts](/src/modules/health/health.controller.ts) | TypeScript | 75 | 11 | 15 | 101 |
| [src/modules/health/health.module.ts](/src/modules/health/health.module.ts) | TypeScript | 17 | 0 | 2 | 19 |
| [src/modules/mail/mail.service.ts](/src/modules/mail/mail.service.ts) | TypeScript | 88 | 5 | 14 | 107 |
| [src/modules/mail/templates/new-device.hbs](/src/modules/mail/templates/new-device.hbs) | Handlebars | 108 | 0 | 9 | 117 |
| [src/modules/mail/templates/reset-password.hbs](/src/modules/mail/templates/reset-password.hbs) | Handlebars | 134 | 0 | 12 | 146 |
| [src/modules/permissions/decorators/permissions.decorator.ts](/src/modules/permissions/decorators/permissions.decorator.ts) | TypeScript | 4 | 4 | 3 | 11 |
| [src/modules/permissions/dto/create-permission.dto.ts](/src/modules/permissions/dto/create-permission.dto.ts) | TypeScript | 28 | 0 | 3 | 31 |
| [src/modules/permissions/dto/update-permission.dto.ts](/src/modules/permissions/dto/update-permission.dto.ts) | TypeScript | 3 | 0 | 2 | 5 |
| [src/modules/permissions/entities/permission.entity.ts](/src/modules/permissions/entities/permission.entity.ts) | TypeScript | 23 | 1 | 7 | 31 |
| [src/modules/permissions/guards/permissions.guard.ts](/src/modules/permissions/guards/permissions.guard.ts) | TypeScript | 43 | 2 | 11 | 56 |
| [src/modules/permissions/permissions.controller.spec.ts](/src/modules/permissions/permissions.controller.spec.ts) | TypeScript | 16 | 0 | 5 | 21 |
| [src/modules/permissions/permissions.controller.ts](/src/modules/permissions/permissions.controller.ts) | TypeScript | 69 | 0 | 8 | 77 |
| [src/modules/permissions/permissions.module.ts](/src/modules/permissions/permissions.module.ts) | TypeScript | 12 | 0 | 2 | 14 |
| [src/modules/permissions/permissions.service.spec.ts](/src/modules/permissions/permissions.service.spec.ts) | TypeScript | 14 | 0 | 5 | 19 |
| [src/modules/permissions/permissions.service.ts](/src/modules/permissions/permissions.service.ts) | TypeScript | 101 | 42 | 21 | 164 |
| [src/modules/roles/decorators/roles.decorator.ts](/src/modules/roles/decorators/roles.decorator.ts) | TypeScript | 3 | 0 | 2 | 5 |
| [src/modules/roles/dto/create-role.dto.ts](/src/modules/roles/dto/create-role.dto.ts) | TypeScript | 29 | 0 | 3 | 32 |
| [src/modules/roles/dto/update-role.dto.ts](/src/modules/roles/dto/update-role.dto.ts) | TypeScript | 3 | 0 | 2 | 5 |
| [src/modules/roles/entities/role.entity.ts](/src/modules/roles/entities/role.entity.ts) | TypeScript | 32 | 2 | 8 | 42 |
| [src/modules/roles/guards/roles.guard.ts](/src/modules/roles/guards/roles.guard.ts) | TypeScript | 38 | 3 | 10 | 51 |
| [src/modules/roles/roles.controller.spec.ts](/src/modules/roles/roles.controller.spec.ts) | TypeScript | 16 | 0 | 5 | 21 |
| [src/modules/roles/roles.controller.ts](/src/modules/roles/roles.controller.ts) | TypeScript | 66 | 0 | 8 | 74 |
| [src/modules/roles/roles.module.ts](/src/modules/roles/roles.module.ts) | TypeScript | 13 | 0 | 2 | 15 |
| [src/modules/roles/roles.service.spec.ts](/src/modules/roles/roles.service.spec.ts) | TypeScript | 14 | 0 | 5 | 19 |
| [src/modules/roles/roles.service.ts](/src/modules/roles/roles.service.ts) | TypeScript | 128 | 47 | 25 | 200 |
| [src/modules/users/dto/create-user.dto.ts](/src/modules/users/dto/create-user.dto.ts) | TypeScript | 41 | 0 | 6 | 47 |
| [src/modules/users/dto/update-user.dto.ts](/src/modules/users/dto/update-user.dto.ts) | TypeScript | 3 | 0 | 2 | 5 |
| [src/modules/users/entities/user.entity.ts](/src/modules/users/entities/user.entity.ts) | TypeScript | 5 | 2 | 2 | 9 |
| [src/modules/users/users-cleanup.cron.ts](/src/modules/users/users-cleanup.cron.ts) | TypeScript | 30 | 6 | 7 | 43 |
| [src/modules/users/users.controller.spec.ts](/src/modules/users/users.controller.spec.ts) | TypeScript | 16 | 0 | 5 | 21 |
| [src/modules/users/users.controller.ts](/src/modules/users/users.controller.ts) | TypeScript | 84 | 0 | 8 | 92 |
| [src/modules/users/users.module.ts](/src/modules/users/users.module.ts) | TypeScript | 12 | 0 | 2 | 14 |
| [src/modules/users/users.service.spec.ts](/src/modules/users/users.service.spec.ts) | TypeScript | 14 | 0 | 5 | 19 |
| [src/modules/users/users.service.ts](/src/modules/users/users.service.ts) | TypeScript | 160 | 46 | 31 | 237 |
| [src/utils/access-control.util.ts](/src/utils/access-control.util.ts) | TypeScript | 33 | 11 | 11 | 55 |
| [src/utils/auth-decorator.util.ts](/src/utils/auth-decorator.util.ts) | TypeScript | 50 | 29 | 7 | 86 |
| [src/utils/error.util.ts](/src/utils/error.util.ts) | TypeScript | 18 | 7 | 6 | 31 |
| [src/utils/sanitize.util.ts](/src/utils/sanitize.util.ts) | TypeScript | 53 | 51 | 12 | 116 |
| [src/utils/url-format.util.ts](/src/utils/url-format.util.ts) | TypeScript | 0 | 0 | 1 | 1 |

[Summary](results.md) / Details / [Diff Summary](diff.md) / [Diff Details](diff-details.md)