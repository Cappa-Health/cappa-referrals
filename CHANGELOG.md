# Changelog

All notable changes to this project will be documented in this file.

## [0.0.1] - 2026-04-20 1st release

## [2026-04-20] — Alaska Requirement Changes (PR #11)

### Changed

- Updated lower-blood-sugar modal title to "Diabetes Self-Management Education and Support programs"
- Removed Homer, Kenai, and Kotzebue from the lower-blood-sugar accordion location list
- Updated bottom-of-page paragraph on lower-blood-sugar to reference managing blood pressure instead of managing diabetes

## [2026-04-20] — Login Feature (PR #10)

### Changed

- Renamed "HALT Dashboard" to "HALT Referral Dashboard" across all screens and text references

### Fixed

- Corrected User List subtitle to accurately describe its purpose
- Extracted dashboard inline styles to external stylesheets; consolidated shared table styles into `dashboard-shared.css`

## [2026-04-16] — Security & Accessibility Hardening

### Added

- Email format validation and field length limits on the public intake endpoint
- Branded HTML invitation email with dashboard link and temporary password expiry warning

### Changed

- Improved WCAG accessibility across admin, auth, and dashboard UI
- Moved intake API URL into `auth-config.js`, sourced from CloudFormation
- Replaced brittle Cognito error-message sniffing with a pre-check-backed `InvalidParameterException` handler
- Renamed `res`/`resp` variables to descriptive snake_case names throughout

### Fixed

- Cross-state authorization gap in `PATCH /referrals` — non-admins can only update referrals in their assigned state
- Enter key submission now routed through a handler map instead of repeated DOM style checks
- Removed dead string-parsing fallback from `isAdmin` — `cognito:groups` is always an array in a decoded JWT
- Removed unused `kwargs` variable in admin referral scan
- Removed email addresses and internal system details from all client-facing error and success messages

## [2026-04-15] — Auth Flow Fixes

### Fixed

- Password reset flow and CloudFormation stack synced to live state
- Forgot password flow
- JWT decoding
- Disabled flow state handling
- Reset password UI flow
- Admin page redirect: non-admin users are now redirected to the HALT Referral Dashboard on login

## [2026-04-14] — Admin & Dashboard Features

### Added

- Admin group access control — only users in the admin group can access the admin page
- Delete user and edit user functionality
- Reset password from admin panel
- Sortable columns in the user list
- Pagination for user list
- Navigation between admin and dashboard views
- Logged-in user displayed in header
- Smooth animation when account-deletion warning appears or is dismissed

### Fixed

- Duplicate user bug
- Dashboard refresh issue
- Various UI consistency fixes

## [2026-04-13] — Dashboard & Notifications

### Added

- HALT Referral Dashboard with active filter chips
- Active filters row with collapsing referral detail view on filter change
- System sends notification email and stores intake data in DynamoDB
- Content Security Policy headers on all pages

### Fixed

- Redirects from email notification links now open dashboard with correct active filters

## [Earlier] — Landing Pages & WCAG Compliance

### Added

- Lower blood sugar landing page
- Lower blood pressure landing page
- Lose weight landing page
- State selector on index page
- Favicon

### Changed

- Accordion location data extracted to config
- Responsive layout improvements across all landing pages
- Top logos and titles aligned left on program landing pages
- Reduced motion support for transitions and hover effects
- Improved accessibility: nav focus indicators, skip link target focusability
- Modal layout, content, and form label text updated
- Hero titles, body copy, and modal content updated across landing pages

### Fixed

- Various WCAG compliance issues across multiple passes
- Hero image bug
- Modal display timing issues
