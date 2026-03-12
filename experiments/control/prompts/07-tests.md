# Prompt 7 — Test Suite

Now write a comprehensive test suite for everything you have built.

Requirements:
- Unit tests for all service-layer functions (auth logic, business rules, slug generation, pagination math)
- Integration tests for every API endpoint in the spec: correct status codes, response shapes, authorization checks (401, 403), validation errors (422)
- At least one test for each error path: resource not found (404), duplicate resource (422), unauthorized access (403)
- Test names must describe the behaviour, not the implementation (e.g. `registers a new user with valid credentials`, not `test POST /api/users`)

Produce a summary when done: total test count, coverage %, any gaps you intentionally left.
