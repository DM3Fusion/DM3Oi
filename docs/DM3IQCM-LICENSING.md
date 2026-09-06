# DM3Oi Licensing (06A)

License entitlement (`TRIAL`, `ACTIVE`, `EXPIRING`, `EXPIRED`, `SUSPENDED`, `CANCELLED`) is separate from commercial state (`TRIAL`, `PAID`, `UNPAID`, `COMP`, `INTERNAL`). Commercial state never independently grants or denies access.

The current license is the single `organization_licenses` row with `is_current = true`; a partial unique index prevents conflicts. Changes retire the prior row, create a new term, and append an immutable `organization_license_events` audit record. Renewals therefore preserve history.

Dates are UTC timestamps. Expiration cannot precede start, and grace cannot precede expiration. Effective status is computed server-side: an otherwise-active license becomes `EXPIRING` within the 30-day UI warning threshold; expired licenses remain usable during grace; suspended and cancelled licenses are blocked; expired licenses after grace are blocked. `EXPIRING` is never manually flipped by a job. Notification-event thresholds are independently stored as 60, 30, 14, 7, 3, and 1 days for 06B.

Organization lifecycle status has precedence: `SUSPENDED` or `ARCHIVED` organizations are blocked regardless of license. `SUPER_ADMIN` retains Back Office access and license administration. Tenant roles cannot mutate licenses.

For rollout compatibility, an organization with no license record remains accessible. This means “unlicensed,” not PAID, COMP, TRIAL, or ACTIVE; once a record exists, effective licensing governs access. 06A sends no notifications; 06B may schedule notifications from the persisted thresholds. No payment processing or billing provider integration is included. Future billing integration must remain separate from entitlement and audit history.
