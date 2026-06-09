# Changelog

## v0.2.0

- Added application-owned user accounts with employee, clerk, and admin roles.
- Added strong password validation, scrypt password hashing, login lockout, and database-backed sessions.
- Added email-based password reset with SMTP settings managed by administrators.
- Added audit logs for authentication, document access, downloads, uploads, maintenance, settings, and errors.
- Added tamper-evident audit hash chaining.
- Added administrator pages for users, mail settings, watermark settings, and audit logs.
- Added configurable PDF preview watermarking with an administrator off switch.
- Restricted downloads, exports, uploads, replacements, and document status changes to clerk/admin roles.

## v0.1.0

- Initial NAS document library with PDF upload, version management, change notices, search, preview, and CSV export.
