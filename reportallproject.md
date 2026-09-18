# Full Project Audit Report

## 1. Executive Summary
- **Overall Readiness Score**: 40/100
- **Production-Readiness Verdict**: **NOT READY (Critical Security Fixes Required)**
- **Summary**: The application is a well-structured Progressive Web Application (PWA) with strong feature implementations (attendance, reporting, gamification). However, it currently suffers from severe, critical security vulnerabilities. Specifically, a global fallback rule in Firestore bypasses all role-based access controls, and the OneSignal REST API key is fully exposed to the client side. Additionally, the backend push notification proxy endpoint is completely unauthenticated. These must be remediated before production deployment to prevent total database compromise and notification spam.

## 2. Critical Issues (Must Fix Before Production)

### [CRITICAL-01] Global Firestore Catch-All Rule Bypasses All Security
- **Affected File**: `firestore.rules` (Lines 167-170)
- **Description**: The rules file contains a fallback `match /{document=**} { allow read, write: if isSignedIn(); }`. Because Firestore rules evaluate using a logical OR, this single rule grants *every authenticated user* full read and write access to the entire database, overriding all careful `isAdmin()` or `isAssistant()` checks defined above it.
- **Root Cause**: Overly permissive development rules left in production.
- **Remediation**: 
  1. Open `firestore.rules`.
  2. Completely delete the `10. Fallback Catch-All` section (lines 167-170).
  3. Ensure all collections have explicit, scoped `match` rules (which they already do).

### [CRITICAL-02] Client-Side Exposure of OneSignal REST API Key
- **Affected File**: `src/utils/onesignal.ts` (Lines 4-5) & `.env.example`
- **Description**: The OneSignal REST API Key (`VITE_ONESIGNAL_REST_API_KEY`) is prefixed with `VITE_`, meaning it is bundled into the public frontend JavaScript. Furthermore, a hardcoded fallback (`['os_v2_app', 'o6...'].join('_')`) explicitly leaks the active production key. Anyone can extract this key and send malicious push notifications, or modify OneSignal app configurations.
- **Remediation**:
  1. Remove `export const ONESIGNAL_REST_API_KEY` entirely from `src/utils/onesignal.ts`.
  2. Remove the fallback direct OneSignal fetch logic (`fetch('https://onesignal.com/api/v1/notifications'...)`) from `src/utils/onesignal.ts`. The client must *only* use the `/api/onesignal/push` backend proxy.
  3. In `.env` (and `.env.example`), rename `VITE_ONESIGNAL_REST_API_KEY` to `ONESIGNAL_REST_API_KEY` (removing the `VITE_` prefix) so it is only accessible in `server.ts`.

### [CRITICAL-03] Unauthenticated Backend Push Notification Endpoint
- **Affected File**: `server.ts` (Lines 17-64)
- **Description**: The `/api/onesignal/push` endpoint has no authentication checks. Any anonymous internet user can send a POST request to this URL and blast notifications to all your subscribed users.
- **Remediation**:
  1. Integrate the `firebase-admin` SDK in `server.ts`.
  2. Add an Express middleware to extract the `Authorization: Bearer <token>` header.
  3. Verify the token using `admin.auth().verifyIdToken()`.
  4. (Optional but recommended) Fetch the user's role from Firestore and ensure they are an `admin` or `assistant` before proceeding with the OneSignal dispatch.

## 3. PWA Compliance Report

| Checklist Item | Status | Notes |
| :--- | :---: | :--- |
| **`manifest.json` Validity** | ✅ Pass | Manifest is properly generated via `vite-plugin-pwa` config. |
| **Icons & Sizes** | ⚠️ Warning | `masked-icon.svg` is included in assets but missing `"purpose": "maskable"` in the `manifest.icons` array. |
| **Service Worker Registration** | ✅ Pass | Correctly registered in `src/main.tsx` via `virtual:pwa-register`. |
| **Caching Strategy** | ✅ Pass | Workbox integration properly configured with fallback exclusions for `/api/`. |
| **OneSignal SW Integration** | ✅ Pass | Custom import script successfully merges OneSignal into the main PWA SW, preventing conflicts. |
| **Installability (Lighthouse)** | ✅ Pass | Meets baseline installability criteria. |

## 4. Push Notifications Review

- **Finding 1: Scheduled Notification Target Segment Logic Bug**
  - **Location**: `src/pages/admin/ManageNotifications.tsx` (Lines 190, 246)
  - **Issue**: Manual pushes correctly target `['Subscribed Users']`, but the automated scheduled notifications (in the background loop) still target `['Subscribers']`. OneSignal will return an error, and these scheduled pushes will fail silently.
  - **Fix**: Update the `includedSegments` string from `'Subscribers'` to `'Subscribed Users'` in lines 190 and 246.
- **Finding 2: Deep Linking Implementation**
  - **Location**: `server.ts`
  - **Issue**: Tapping a notification attempts to use the `referer` header as the fallback URL. While this opens the PWA, it's brittle.
  - **Fix**: Explicitly pass a default URL (e.g., your homepage) in the `sendOneSignalPush` payload from the frontend.

## 5. Data & State Conflicts

- **Finding 1: Attendance Duplication & Race Conditions**
  - **Status**: Fixed. The recent migration in `FastAttendance.tsx` to use deterministic IDs (`${deacon.id}_${activeActivity.id}_${selectedDate}`) via `setDoc` prevents double-logging.
- **Finding 2: LocalStorage Auth Loops on Mobile WebViews**
  - **Status**: Mitigated. `src/lib/firebase.ts` now strictly requests `browserLocalPersistence` with a fallback, preventing silent logouts on strict mobile browsers.
- **Finding 3: Disconnected Points and Attendance**
  - **Location**: `src/pages/admin/FastAttendance.tsx`
  - **Issue**: Deleting an attendance record previously orphaned the points log. 
  - **Status**: Fixed. The new deletion logic correctly ties `att_pt_...` IDs to `attendance_records` IDs.

## 6. Permissions & Authorization Review

- **Finding 1: Missing Frontend Role-Based Routing Guards**
  - **Location**: `src/App.tsx`, `src/components/ProtectedRoute.tsx`
  - **Issue**: `ProtectedRoute` only verifies if `currentUser` exists. It does not check if the user is an admin. While the database rules (once fixed) will prevent data mutation, any standard user can currently navigate to `/admin/reports` or `/admin/users` and view the administrative UI.
  - **Fix**: Create an `<AdminRoute>` component that checks `if (userData.role !== 'admin' && userData.role !== 'assistant') return <Navigate to="/" />` and wrap all `/admin/*` routes with it.

## 7. Security Findings

| Severity | Finding | Remediation |
| :--- | :--- | :--- |
| **High** | **Missing HTTP Security Headers** | The Express backend in `server.ts` does not use `helmet`. Run `npm install helmet` and add `app.use(helmet())` to prevent XSS, sniffing, and clickjacking attacks. |
| **High** | **Missing Rate Limiting** | The `/api/onesignal/push` endpoint is vulnerable to DoS/Spam. Add `express-rate-limit` to restrict requests (e.g., max 20 pushes per minute per IP). |
| **Medium** | **Insecure CORS Configuration** | The Express server does not explicitly configure CORS. While running behind a reverse proxy, explicitly locking down allowed origins using the `cors` package is best practice. |

## 8. Code Quality Findings

- **CQ1: Missing Global React Error Boundary**
  - **Location**: `src/main.tsx`
  - **Issue**: If any component throws an unhandled JS error, the entire PWA will white-screen.
  - **Fix**: Wrap `<App />` in a top-level `<ErrorBoundary>` component that renders a friendly "Something went wrong" UI with a reload button.
- **CQ2: Large Bundle Sizes (Recharts)**
  - **Location**: Build Output
  - **Issue**: The Vite build warns that chunks exceed 500KB. `Recharts` is heavy.
  - **Fix**: Use React `lazy()` and `Suspense` for administrative pages (e.g., `ComprehensiveReports.tsx`) so the charting library is only downloaded when an admin actually opens the reports page, drastically speeding up the initial load for standard users.
- **CQ3: Silent Promise Rejections**
  - **Location**: `src/pages/admin/ManageNotifications.tsx`
  - **Issue**: `sendOneSignalPush(...).catch(console.error)` is used extensively. If it fails, the UI shows a "Success" toast anyway because the failure is swallowed.
  - **Fix**: `await` these calls and wrap them in a `try/catch` block to show an error toast (`setErrorMsg`) to the admin if the dispatch fails.

## 9. Recommendations & Next Steps

1. **Immediate (Today):** 
   - Remove the Catch-All rule in `firestore.rules`.
   - Remove the hardcoded OneSignal API key from the frontend and secure the Node endpoint.
2. **Short-Term (This Week):**
   - Implement `<AdminRoute>` guards in `App.tsx` for visual security.
   - Fix the `"Subscribers"` string bug for scheduled notifications.
3. **Long-Term:**
   - Implement React `lazy()` for heavy charts.
   - Add a Global Error Boundary.
   - Implement `helmet` and rate limiting in `server.ts`.

## 10. Overall Readiness Verdict

**Verdict: NOT READY**

While the application boasts excellent functionality, strong PWA integration, and clean UI logic, the **critical security vulnerabilities (Database Catch-All, API Key Leak, Unauthenticated Proxy)** render it highly vulnerable to exploitation. Once the three critical issues outlined in Section 2 are resolved, the application will be fully production-ready.
