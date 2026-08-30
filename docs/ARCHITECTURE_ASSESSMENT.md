# Cake City Mobile Architecture Assessment

## Current state

`CakeCity-Mobile-App` is a new Expo SDK 57 / React Native 0.86 / React 19 / strict
TypeScript repository. It currently contains only the generated blank application and
has no navigation, API client, authentication, tests, environments, or release setup.

The separate `Desktop/Cakecity` repository is the existing Cake City production-platform
codebase. It already contains:

- a FastAPI, SQLAlchemy and PostgreSQL API;
- WooCommerce-synchronised catalogue and authoritative order integration;
- rotating mobile refresh-token endpoints and bearer access tokens;
- customer, cart, checkout, payment, tracking, loyalty, notification and celebration APIs;
- Next.js customer, admin and kitchen applications;
- Docker, migrations, CI, deployment and operational documentation.

The inspected environment template contains configuration names for WooCommerce,
PostgreSQL, Redis, RabbitMQ, JWT signing, M-Pesa, Flutterwave, Cloudinary, Brevo and Web
Push. No secret values were copied into this repository or this assessment.

## Target state

This repository will be the native customer application for Android and iOS. It will use
Expo Router and consume the existing Cake City FastAPI API rather than duplicating the
commerce backend or calling WooCommerce from a device.

The mobile app owns native navigation, device-safe session storage, customer experience,
offline-aware query caching, push registration, location permissions, deep links and
mobile release configuration. The existing platform remains the authority for identity,
catalogue, price, stock, checkout, payment, orders, delivery, rewards and customer data.

## Architecture decision

Do not create a second FastAPI service or a second product database in this repository.
That would split commerce authority, introduce unsafe reconciliation and conflict with the
master prompt's requirement to reuse the existing Cake City platform.

The mobile application will call environment-specific HTTPS API origins. The existing API
must gain the small missing native-authentication surface: mobile registration and Google
OpenID Connect token exchange. Google credentials and token verification remain server
controlled; no Google client secret is embedded in the app.

## Gaps

- Expo Router, typed routes and deep-link scheme are not configured.
- Required mobile libraries and app-level providers are absent.
- There is no API client, refresh coordination or SecureStore session persistence.
- The API supports email/password registration for browsers and email/password login,
  refresh and logout for mobile, but does not yet expose mobile registration.
- Google authentication is not implemented in either the mobile scaffold or the API.
- No native customer screens, tests, EAS profiles, mobile assets or release documentation
  exist yet.
- Real production integrations require deployment URLs and credentials not present in the
  new repository.

## Risks

- Expo SDK 57 requires development builds for native Google Sign-In; Expo Go is not a valid
  acceptance environment for that integration.
- Google subject identity must be unique and must not silently take over an existing email
  account without a verified linking policy.
- Mobile refresh tokens must be stored only in SecureStore and rotated atomically. Access
  tokens should remain in memory where possible.
- The OneDrive workspace can make Metro and package installation slow; build verification
  may require a clean local staging copy while source remains on the Desktop.
- Catalogue, payment and delivery screens must show loading, empty, unavailable and error
  states when real services are not configured; they must never invent data.

## Implementation plan

1. Foundation: Expo Router, typed routes, design tokens, providers, environments, API client,
   secure authentication, CI and EAS configuration.
2. Commerce: catalogue, product detail, server-side search, persistent cart and authoritative
   checkout against the existing API.
3. Fulfilment: addresses, branches, delivery selection, order history and live tracking.
4. Retention: favourites, rewards, notifications, celebrations and validated reorder.
5. Advanced workflows: custom cake, corporate and event ordering after their real API
   contracts are available.

## Database plan

Continue using the existing PostgreSQL database and SQL migrations in the Cake City platform.
Google identity requires provider-account fields or a normalised external-identities table
with a unique `(provider, subject)` constraint. Schema changes must be additive migrations.
No production data or development fixture database will live in the mobile repository.

## API plan

- Reuse `/v1/auth/mobile/login`, `/v1/auth/mobile/refresh`, `/v1/auth/mobile/logout` and
  `/v1/auth/me`.
- Add `/v1/auth/mobile/register` returning the existing mobile session response.
- Add `/v1/auth/mobile/google` accepting a Google ID token, verifying issuer, audience,
  signature, expiry and verified email server-side, then issuing the same rotating Cake City
  session format.
- Reuse existing catalogue, discovery, cart, checkout, order, rewards, notifications and
  address routes. Add capabilities only as vertical slices require them.

## Mobile plan

Use Expo Router route groups for unauthenticated and authenticated navigation. Use TanStack
Query for server state, Zustand only for appropriate device-local state, React Hook Form and
Zod for forms, and SecureStore for refresh tokens. Screens render only API data or honest
empty/unavailable states.

## Admin plan

Keep administration in the existing secure Next.js Cake City Command application. Do not
expose admin operations in the customer mobile client.

## Cloud plan

Use the existing Render/Vercel deployment boundary. Configure development, preview and
production mobile API URLs through public Expo environment variables and secrets through
the API deployment. Use EAS development, preview and production profiles for signed native
builds.

## Security plan

Use PKCE/native Google Sign-In, backend Google token verification, short-lived Cake City
access tokens, rotating opaque refresh tokens, SecureStore, rate limits, generic credential
errors, request IDs and server-side authorization. Never store provider client secrets,
payment secrets or WooCommerce credentials in the app.

## Testing plan

Add mobile unit and component tests for session restoration, registration, login, Google
exchange, refresh rotation, logout and error states. Extend backend tests for token validation,
account collision, inactive accounts, session issuance and replay protection. CI must run
linting, strict type checking, tests and an Expo export/build validation.
