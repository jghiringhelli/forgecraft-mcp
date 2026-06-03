# TaskFlow API

## Problem

Teams lose track of tasks when they're spread across chat, email, and sticky notes.
There is no single authoritative source of what needs to be done, by whom, and by when.

## Users

- **Developer**: creates tasks, assigns them, marks them complete
- **Team lead**: reviews task status, tracks progress across the team

## Goals

- Create, list, and update tasks via a REST API
- Each task has: title, description, assignee, status (open/in-progress/done), due date
- Tasks belong to projects; a user can be a member of multiple projects
- All operations require authentication

## Components

- **Task service**: business logic for task lifecycle
- **Project service**: project membership and access control
- **Auth service**: JWT-based authentication
- **REST API layer**: thin HTTP handlers delegating to services
- **Repository layer**: PostgreSQL-backed persistence via repository pattern

## External Systems

- PostgreSQL database
- SMTP for due-date reminder emails (future)

## Non-Functional Requirements

- Response time p99 < 200ms for list operations
- Test coverage ≥ 80% on service layer
- All endpoints authenticated — no anonymous access
