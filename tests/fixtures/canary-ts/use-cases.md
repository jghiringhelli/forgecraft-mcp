# Use Cases — TaskFlow API

## UC-001: Create Task

**Actor**: Authenticated developer
**Precondition**: User is authenticated; project exists and user is a member
**Trigger**: POST /projects/:projectId/tasks with title, description, assignee, due_date
**Main Flow**:
1. API validates the request body (required: title; optional: description, assignee, due_date)
2. Auth service verifies the caller is a project member
3. Task service creates the task with status=open and returns the created task
**Postcondition**: Task exists in the database with a unique ID; status is open
**Error Cases**:
- Caller not a project member: 403 Forbidden
- Missing title: 400 Bad Request with field validation errors
- Project not found: 404 Not Found
**Acceptance Criteria**:
- [ ] POST /projects/:id/tasks with valid body returns 201 + task object with id
- [ ] POST without title returns 400 with error on title field
- [ ] POST by non-member returns 403

## UC-002: List Tasks

**Actor**: Authenticated developer or team lead
**Precondition**: User is authenticated; project exists and user is a member
**Trigger**: GET /projects/:projectId/tasks with optional ?status= and ?assignee= filters
**Main Flow**:
1. Auth service verifies project membership
2. Task service queries tasks for the project, applying optional filters
3. Returns paginated list of tasks sorted by due_date ascending (nulls last)
**Postcondition**: Caller receives the filtered task list; empty array if no matches
**Error Cases**:
- Caller not a project member: 403 Forbidden
- Invalid status value: 400 Bad Request
**Acceptance Criteria**:
- [ ] GET /projects/:id/tasks returns 200 + array of tasks
- [ ] ?status=open filters to open tasks only
- [ ] Non-member receives 403

## UC-003: Update Task Status

**Actor**: Authenticated developer
**Precondition**: Task exists; caller is authenticated and a project member
**Trigger**: PATCH /tasks/:taskId with { status: "in-progress"|"done" }
**Main Flow**:
1. Auth service verifies project membership for the task's project
2. Task service validates the status transition (open→in-progress→done; no backwards transitions)
3. Task service updates the task and returns the updated task
**Postcondition**: Task status is updated; updated_at is set to now
**Error Cases**:
- Invalid transition (e.g. done→open): 422 Unprocessable Entity
- Task not found: 404 Not Found
- Caller not a member: 403 Forbidden
**Acceptance Criteria**:
- [ ] PATCH with valid status returns 200 + updated task
- [ ] PATCH with invalid transition returns 422
- [ ] Non-member receives 403
