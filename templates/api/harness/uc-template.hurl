# L2 Harness: {{uc_id}} — {{uc_title}}
# Actor: {{actor}}
# Precondition: {{precondition}}
# Postcondition: {{postcondition}}
#
# This is a behavioral harness probe. A failure is a specification violation.
# Implement the main flow steps from the use case below.

# Step 1: [precondition setup if needed]
# POST http://{{host}}/api/auth/login
# ...

# Step 2: [primary action]
# TODO: implement UC main flow as HTTP sequence
GET http://{{host}}/api/endpoint
Authorization: Bearer {{token}}

HTTP 200
[Asserts]
# jsonpath "$.field" == "expected_value"
