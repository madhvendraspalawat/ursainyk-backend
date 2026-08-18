# ADR-0004: In-house authentication in Nest

**Status:** accepted · **Date:** 2026-08-18

## Decision

Candidates authenticate by phone OTP (MSG91), portal users by email + password with mandatory TOTP MFA for Admin/Super-Admin; JWT access + rotating refresh tokens with server-side revocation. Managed IdPs (Cognito/Auth0/Clerk) were rejected: OTP-first flows for semi-literate users are awkward in their hosted UIs, and Indian data-residency + DPDP processor terms are simpler to guarantee in-house. Libraries, not frameworks: argon2, otplib, passport-jwt.

## Consequences

_To expand as the workstream lands._
