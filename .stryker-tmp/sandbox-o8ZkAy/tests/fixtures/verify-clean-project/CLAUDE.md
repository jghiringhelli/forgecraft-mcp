# Clean Project — §4.3 Fixture

This instruction file describes the architecture, layer rules, conventions, patterns,
and decisions for the Clean Project RealWorld Conduit API fixture.

## Architecture

Layered (Ports & Adapters). Route handlers delegate to services; services delegate
to repositories; repositories own all DB access. No layer-skipping is permitted.

```
Routes → Services → Repositories → Prisma → PostgreSQL
```

Dependencies point inward. The domain layer has zero framework imports.

## Conventions

- TypeScript 5, Node 18+
- Conventional commits (feat|fix|refactor|docs|test|chore)
- Repository pattern for all database access
- Interface-first: define ports before implementations
- Guard clauses and early return (no deep nesting)
- All public exports have JSDoc with typed params and returns

## Decisions

- ADR-001: Express + Prisma + PostgreSQL as stack
- ADR-002: Repository pattern to isolate DB access from services
- ADR-003: JWT authentication with `Authorization: Token <token>` format

## Domain

Users, Articles, Comments, Tags — RealWorld Conduit specification.

### Core entities
- `User`: registration, login, profile, follow
- `Article`: CRUD, favourite, list with filter/pagination
- `Comment`: create, list, delete (per article)
- `Tag`: global tag list

## Error Handling

All errors use the `AppError` hierarchy:
- `ValidationError` → 422
- `AuthenticationError` → 401
- `AuthorizationError` → 403
- `NotFoundError` → 404

Errors always use the envelope: `{ "errors": { "body": ["message"] } }`.

## Testing

- Unit tests per service and repository
- Integration tests per route
- Test names are specifications: `rejects_unauthenticated_delete`
- Coverage target: 80% minimum, 90% on new/changed code
