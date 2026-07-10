# Phase 3 — Two-Account End-to-End: Spec

Date: 2026-07-10
Status: 🟡 Spec'd — ready for implementation

---

## Overview

Make two accounts work perfectly end-to-end. Everything else is future.

---

## 1. Account Creation Modal

**Current:** Inline form in Accounts tab (id, name fields).
**Target:** Modal dialog triggered by "+ Create Account" button.

### Form Fields

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| Account ID | text | ✅ | Slugified, used for directories |
| Display Name | text | ✅ | User-facing name |
| Instagram IG User ID | text | ❌ | Dummy for now — from Meta/Facebook Developer |
| Instagram Access Token | text | ❌ | Dummy for now — long-lived token |
| Facebook Page ID | text | ❌ | Dummy for now — for IG business account linking |

**Dummy values:** Pre-fill with placeholders, submission always succeeds.
**On submit:** Creates the account with the standard scaffold + saves IG credentials to `account.instagram` config.

---

## 2. Review Tab — Last-Approved Tracking & Pagination

**Parked for now.** Need to explore approaches before implementing.

### Key Requirements (future)
- Images paginated at 10 per page
- "Last approved image" marks a review boundary
- Everything before the boundary that wasn't approved = auto-rejected
- Everything after = still pending

### Known Approaches to Explore
1. **Cursor-based pagination** — `GET /api/manifest?allImages=true&cursor=<id>&limit=10`
2. **Review session state** — a `reviewedAt` timestamp per image, set when user advances past it
3. **"Mark reviewed up to here" button** — explicit user action instead of implicit boundary

---

## 3. Queue Tab — Entry Preview Modal

**Current:** Queue tab shows entries as text rows with caption + status badge.
**Target:** Clicking a queue entry opens a preview modal with:

- Full-size image
- Full caption (commentary + hashtags)
- Scheduled date/time
- Status badge (queued / published / failed)
- Edit caption button
- Remove from queue button

Reuse the existing preview modal pattern from the Review tab.

**API needed:** `PATCH /api/queue` — update `scheduledAt` for drag-and-drop rescheduling.

---

## 4. Calendar Tab (NEW)

### Purpose
Plan, review, and audit scheduled posts across all accounts.

### Data Source
The calendar is a **visualization of the queue** — no separate storage. Reads `publish-queue.json` across all accounts. Shows:
- **Queued** images (scheduled but not yet published)
- **Published** images (marked as published)

### Visual Format
**Weekly list** — 7 days as columns, posts listed per day.

### Account Scope
**Unified** — all accounts overlaid on one calendar.
**Filter** by account (dropdown or checkboxes).

### Interactions (Essential)
| # | Action | Behavior |
|---|--------|----------|
| 1 | 👁️ See week | Days with posts show count/thumbnail |
| 2 | 👆 Click a day | Expand to show that day's posts (image thumbnails + caption preview) |
| 3 | ↔️ Drag & drop | Move a post to a different day → `PATCH /api/queue { id, scheduledAt }` |
| 4 | 🔍 Click a post | Open preview modal (image + full caption + schedule) |
| 5 | 🔎 Filter by account | Dropdown to show/hide accounts on the calendar |

### Interactions (Nice-to-have)
| # | Action | Notes |
|---|--------|-------|
| 6 | Bulk select + export/publish | Future |

### Storage
No new storage. Uses existing `accounts/<id>/output/publish-queue.json`.
Drag-and-drop rescheduling needs a new `PATCH /api/queue` endpoint.

### Tab Placement
New tab **"Calendar"** next to Review, Queue, Templates in the nav bar.

---

## 5. Templates Tab — Three-Way Filter

**Current:** "All" / "Favorites" toggle when an account is selected.
**Target:** Three filters:

| Filter | Shows |
|--------|-------|
| **All** | Global `templates/` only (root level) |
| **Account** | `accounts/<id>/templates/` + favorited templates |
| **Favorites** | Only templates the user has favorited |

### Behavior
- **All accounts selected:** Show only "All" filter (global templates)
- **Account selected:** Show all three filters
- **Account with no templates:** "Account" filter falls back to showing global templates (same as "All")

---

## 6. Quotes Tab — Per-Account

**Current:** Quotes tab shows the global quote pool.
**Target:** Scoped to the selected account's pool.

### Behavior
- **Account selected:** Shows `accounts/<id>/output/quotes.json` pool
- **All accounts selected:** Shows nothing (no global pool) — prompt to select an account

All operations (add, import, expire) operate on the selected account's pool.

---

## 7. Two-Account End-to-End Flow

```
1. Create Account A (modal with dummy IG fields)
2. Create Account B (same)
3. Switch to Account A → Generate images
4. Review → approve some, reject some, leave some pending
5. Switch to Account B → Generate images
6. Review → approve/reject
7. Queue tab → see both accounts' queued items (when "All accounts" selected)
8. Calendar tab → see unified weekly view of all queued + published posts
9. Export → export calendar per account or aggregated
```

---

## Implementation Order

| Priority | Feature | Effort | Dependencies |
|----------|---------|--------|-------------|
| P0 | Account creation modal | Small | None — standalone UI change |
| P0 | Quotes tab per-account | Small | None — data already scoped |
| P0 | Templates tab three-way | Small | None — UI filter change |
| P0 | Queue entry preview | Medium | None — reuse existing modal |
| P0 | Calendar tab (weekly) | Large | Queue data already exists |
| P1 | Pagination + last-approved | Medium | Needs design exploration first |
| P2 | Drag-and-drop reschedule | Small | Calendar must exist first |
| P2 | Bulk actions | Medium | Future |
