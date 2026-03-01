# Agent Guidelines

## Workflow State Transitions

When implementing approval or state-transition operations:

1. **Always use prisma.$transaction()** for multi-table updates
   - Prevents partial state changes on error
   - Ensures atomicity: all changes succeed or all rollback

2. **Validate terminal states early**
   - Check if status is already decided (terminal) before attempting change
   - Throw BadRequestException immediately if resubmission detected

3. **Write tests that prove no partial release**
   - For each transaction, write a test that verifies:
     - If any step fails, the entire transaction fails and no side effects apply
     - Audit logs are only created on complete success

4. **Log all decisions**
   - Every state transition must create an AuditLog entry
   - Capture operator identity and reason/metadata for compliance

## Multi-Table Transaction Safety

When updating ApprovalItem, CampaignMessage, CampaignRun, and AuditLog in a single approval operation:

```typescript
const result = await prisma.$transaction(async (tx) => {
  // 1. Update ApprovalItem status
  const approval = await tx.approvalItem.update({
    where: { id: approvalId },
    data: { status: 'approved', approvedAt: new Date() }
  });

  // 2. Update CampaignMessage status
  const message = await tx.campaignMessage.update({
    where: { id: approval.draftMessageId },
    data: { status: 'QUEUED' }
  });

  // 3. Create AuditLog
  await tx.auditLog.create({
    data: {
      tenantId,
      action: 'APPROVAL_APPROVED',
      actorUserId,
      metadata: { approvalId, messageId: approval.draftMessageId }
    }
  });

  return { approval, message };
});
```

**Key Points:**
- Use `tx` (transaction client) for all queries within the transaction
- If any query throws, the entire transaction rolls back
- AuditLog creation happens only after successful approval/message updates
- All or nothing: either all side effects apply or none

## Tenant Isolation

All approval queries must include tenantId validation:

```typescript
// Always scope to tenant
const approval = await prisma.approvalItem.findFirst({
  where: {
    id: approvalId,
    tenantId: requestTenantId  // Prevent cross-tenant data leaks
  }
});

if (!approval) throw new NotFoundException('Approval not found');
```

**Guard Enforcement:**
- TenantGuard checks x-tenant-id header against route param
- Service methods must re-validate tenantId before returning data
- Never trust client-supplied tenantId without validation

## Pagination Cursor Pattern

For list operations that return multiple items:

```typescript
const items = await prisma.approvalItem.findMany({
  where: { tenantId, status: filter.status },
  take: limit + 1,  // Fetch one extra to detect if there's a next page
  skip: cursor ? 1 : 0,  // Skip the cursor item itself
  cursor: cursor ? { id: cursor } : undefined,
  orderBy: { createdAt: 'desc' }
});

// Determine nextCursor
const hasMore = items.length > limit;
const nextCursor = hasMore ? items[limit].id : null;
const response = {
  items: items.slice(0, limit),
  nextCursor
};
```

**Pattern:**
- take = limit + 1 (one extra to detect if more results exist)
- Use cursor-based pagination (not offset) for consistency
- Return nextCursor as the id of the next item
- Client passes nextCursor as query param to get next page

## Error Response Format

All error responses must follow the consistent ErrorResponse schema:

```typescript
{
  "message": "string",  // Human-readable error message
  "statusCode": 404,
  "timestamp": "2026-02-28T12:00:00Z"
}
```

**Status Code Rules:**
- 400: BadRequestException (invalid input, terminal state resubmission)
- 404: NotFoundException (approval not found)
- 409: Conflict (runId is null, workflow incomplete)
- 403: ForbiddenException (tenant isolation violation)
- 401: Unauthorized (missing/invalid credentials)
