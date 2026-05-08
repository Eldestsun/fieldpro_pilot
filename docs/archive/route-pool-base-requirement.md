# Route Pool Base Assignment Requirement

## Context
During route creation testing, attempted to create a route for the "E District" pool assigned to "FIELD OPERATOR".

## Findings

### Route Creation Flow
1. Selected "E District" from Route Pool dropdown
2. Selected "FIELD OPERATOR" from Assigned Field Crew dropdown
3. Clicked "Generate Preview" - successfully generated route with 25 stops, 46.8 miles
4. Clicked "Save Route" - operation failed

### Error Encountered
**Error Message:** "No base_id provided and route pool has no base assigned"

**API Response:** HTTP 400 Bad Request on `/api/route-runs` endpoint

### Root Cause
The E District route pool lacks a base location assignment, which is a required configuration for route creation.

### Impact
- Route creation blocked for pools without base assignment
- Frontend validation displays clear error message
- Backend API enforces this business rule

### Required Action
Route pools must be configured with a base location before routes can be created from them. This appears to be a system configuration requirement enforced at both frontend validation and API levels.

## Test Results
- Route preview generation: ✅ Working
- Route analytics calculation: ✅ Working (25 stops, 46.8 miles)
- Route persistence: ❌ Blocked by missing base assignment

## Recommendation
Update route pool configuration to assign base locations to all operational pools, or modify the UI to guide users through base assignment when creating routes for unassigned pools.