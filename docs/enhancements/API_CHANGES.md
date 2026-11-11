# API changes

## Current worktree changes

The following additive behavior exists in the current, uncommitted worktree.
Review and deploy the backend and client together; the committed branch alone
does not contain this entire change set.

| Contract | Behavior | Guard / validation |
| --- | --- | --- |
| `PUT /v1/rider/tasks/{identity}/location` | Accepts a rider GPS fix for one delivery task. | Authenticated assigned rider; active collected/in-transit task; paid order; latitude/longitude/accuracy bounds; timezone-aware timestamp and freshness checks; older fixes ignored. |
| `DELETE /v1/rider/tasks/{identity}/location` | Stops sharing and removes the current trip position. | Authenticated assigned rider only. |
| `GET /v1/app-orders/{reference}` | Adds delivery status events and an optional current rider position. | Authenticated order owner; response is `Cache-Control: private, no-store`; no staff notes or proof exposed. |
| `GET /v1/delivery-tracking/map` | Returns a static map shell. | Contains no private coordinates; map tiles require network access. |
| `POST /v1/auth/forgot-password` | Creates a time-limited password-reset request and queues SMTP delivery after returning. | Feature flag; fixed redirect allowlist; account-enumeration-safe response; 15-minute cooldown; raw token is not persisted. |
| `POST /v1/auth/reset-password` | Consumes a single-use token and changes the password. | Atomic token claim, expiry check, refresh-token revocation, push-device disablement and invalidation of other active reset links. |

The backend retains at most one position per trip, returns stale positions only
for a bounded period, and removes positions when sharing stops or task state
becomes terminal. Rider sharing is foreground-only and explicitly opt-in.

## Existing account API gaps

`POST /v1/auth/mobile/google` still returns HTTP 501. Password recovery exists
in the current source, but it is disabled by default and has not been deployed or
tested against a real SMTP sender. Configure it only in the backend's private
environment.

Reset revokes refresh sessions immediately. Previously issued stateless access
tokens are not individually denylisted and remain valid only until their
configured short expiry; release policy should account for that interval.

## Compatibility and release

No client should assume the new tracking fields are present when talking to an
older deployed service. Validate response schemas, deploy the backend, perform
the schema step and then release a client that exposes the feature. Test both
the assigned rider and a different rider/customer; never use public query
parameters for private coordinates.
