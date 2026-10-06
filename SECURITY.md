# Security Policy

This repository contains the Coastal Peaks Air Service website and related
operational documentation. This document explains how to report a vulnerability
and what to expect.

## Supported Versions

Fixes are applied to the latest version on `main`.

| Version          | Supported |
| ---------------- | --------- |
| Latest on `main` | Yes       |
| Older commits    | No        |
| Forks            | No        |

## Reporting a Vulnerability

**Please do not open a public issue for security problems.**

1. **GitHub Private Vulnerability Reporting** (preferred). Use the
   [Report a vulnerability](https://github.com/Chalwk/CPAS/security/advisories/new)
   button on the Security tab.
2. **Email**. Email [chalwk.dev@gmail.com](mailto:chalwk.dev@gmail.com) with
   "SECURITY" in the subject line.

### What to include

- A clear description of the issue
- Steps to reproduce
- The impact you believe it has
- Whether you've disclosed it anywhere else

Redact any personal data or member information from what you send.

## Scope

### In scope

- Vulnerabilities in the Jekyll site (dependency issues, XSS in templates,
  unsafe includes, broken redirects that could leak data)
- Leaked secrets, API keys, or tokens in the source or build files
- Member data exposed unintentionally
- Broken authentication or access controls on any interactive feature

### Out of scope

- Issues that require an attacker to already have access to the repository
- Uptime or availability of GitHub Pages
- Typos or content corrections (open a regular issue)
- Findings from automated scanners with no demonstrated impact

## What to expect

- **Acknowledgement:** within 7 days
- **Initial assessment:** within 14 days
- **Fix:** usually within 30 days for confirmed issues
- **Public disclosure:** coordinated with you

## Automated security

- Dependabot alerts and security updates
- Secret scanning with push protection
