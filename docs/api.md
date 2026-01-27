# GardenBuddy API Documentation

> REST API for GardenBuddy ecosystem - connecting clients and contractors

**Version:** 1.0.0  
**Base URL:** `https://api.gardenbuddy.app`  
**Protocol:** HTTPS only  
**Format:** JSON

---

## Table of Contents

- [Overview](#overview)
- [Authentication](#authentication)
- [Rate Limiting](#rate-limiting)
- [Error Handling](#error-handling)
- [Endpoints](#endpoints)
  - [Authentication](#authentication-endpoints)
  - [Pairing](#pairing-endpoints)
  - [Clients](#client-endpoints)
  - [Jobs](#job-endpoints)
  - [Messages](#message-endpoints)
  - [Sync](#sync-endpoints)
  - [Billing](#billing-endpoints)
  - [Stats](#stats-endpoints)
- [Data Models](#data-models)
- [Webhooks](#webhooks)
- [SDKs](#sdks)
- [Examples](#examples)

---

## Overview

The GardenBuddy API enables:

- **Contractor authentication** - Secure login and session management
- **Client pairing** - QR-code based contractor-client connection
- **Job management** - Schedule, update, and track garden jobs
- **Real-time sync** - Keep both apps synchronized
- **Billing** - Stripe integration for subscriptions
- **Analytics** - Business metrics and reporting

### API Principles

- **RESTful** - Standard HTTP methods (GET, POST, PUT, DELETE)
- **JSON** - All requests and responses use JSON
- **Stateless** - No server-side sessions (JWT tokens)
- **Versioned** - Breaking changes get new version (`/v1`, `/v2`)
- **CORS-enabled** - Can be called from web apps

---

## Authentication

### Contractor Authentication (JWT)

Contractors use email/password authentication with JWT tokens.

**Auth Flow:**

```
1. POST /auth/register → Create account
2. POST /auth/login → Get JWT token
3. Include token in subsequent requests
4. POST /auth/refresh → Get new token when expired
```

**Token Format:**

```
Authorization: Bearer <jwt_token>
```

**Token Lifetime:**

- Access token: 1 hour
- Refresh token: 7 days

### Client Authentication (Device-Based)

Clients use device ID for authentication (no password required).

**Auth Flow:**

```
1. Generate device ID (UUID) on first launch
2. Store locally in GardenBuddy app
3. Include in all API calls via header
```

**Header Format:**

```
X-Device-ID: <device_uuid>
X-Pairing-ID: <pairing_uuid> (after pairing)
```

---

## Rate Limiting

**Limits:**

- Authenticated: 1000 requests/hour
- Unauthenticated: 100 requests/hour
- Sync endpoint: 60 requests/hour (1 per minute)

**Headers:**

```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1737558000
```

**429 Response:**

```json
{
  "error": "rate_limit_exceeded",
  "message": "Too many requests. Try again in 45 minutes.",
  "retry_after": 2700
}
```

---

## Error Handling

### Standard Error Response

```json
{
  "error": "error_code",
  "message": "Human-readable error message",
  "details": {
    "field": "Additional context"
  },
  "timestamp": "2025-01-22T10:30:00Z",
  "request_id": "req_abc123"
}
```

### HTTP Status Codes

| Code | Meaning | Description |
|------|---------|-------------|
| 200 | OK | Request successful |
| 201 | Created | Resource created |
| 400 | Bad Request | Invalid input |
| 401 | Unauthorized | Missing/invalid auth |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not Found | Resource doesn't exist |
| 409 | Conflict | Duplicate resource |
| 422 | Unprocessable | Validation failed |
| 429 | Too Many Requests | Rate limit hit |
| 500 | Internal Error | Server error |
| 503 | Service Unavailable | Maintenance mode |

### Common Error Codes

```
auth_required          - Authentication needed
invalid_token          - JWT token invalid/expired
invalid_credentials    - Wrong email/password
resource_not_found     - Resource doesn't exist
validation_error       - Input validation failed
pairing_expired        - QR code expired
pairing_not_found      - Invalid pairing
trial_expired          - Free trial ended
subscription_required  - Paid plan needed
client_limit_reached   - Max clients for tier
rate_limit_exceeded    - Too many requests
```

---

## Endpoints

## Authentication Endpoints

### POST /auth/register

Create a new contractor account.

**Request:**

```json
{
  "email": "contractor@example.com",
  "password": "secure_password_123",
  "businessName": "Green Thumb Gardens",
  "location": "London, UK"
}
```

**Response:** `201 Created`

```json
{
  "user": {
    "id": "usr_abc123",
    "email": "contractor@example.com",
    "businessName": "Green Thumb Gardens",
    "location": "London, UK",
    "trialEndsAt": "2025-04-22T10:30:00Z",
    "subscriptionTier": "trial",
    "clientCount": 0,
    "createdAt": "2025-01-22T10:30:00Z"
  },
  "tokens": {
    "accessToken": "eyJhbGc...",
    "refreshToken": "eyJhbGc...",
    "expiresIn": 3600
  }
}
```

**Errors:**

- `400` - Invalid email format
- `409` - Email already registered
- `422` - Password too weak

---

### POST /auth/login

Authenticate contractor and get JWT tokens.

**Request:**

```json
{
  "email": "contractor@example.com",
  "password": "secure_password_123"
}
```

**Response:** `200 OK`

```json
{
  "user": {
    "id": "usr_abc123",
    "email": "contractor@example.com",
    "businessName": "Green Thumb Gardens",
    "subscriptionTier": "standard",
    "clientCount": 8
  },
  "tokens": {
    "accessToken": "eyJhbGc...",
    "refreshToken": "eyJhbGc...",
    "expiresIn": 3600
  }
}
```

**Errors:**

- `401` - Invalid credentials
- `403` - Account suspended

---

### POST /auth/refresh

Get new access token using refresh token.

**Request:**

```json
{
  "refreshToken": "eyJhbGc..."
}
```

**Response:** `200 OK`

```json
{
  "accessToken": "eyJhbGc...",
  "expiresIn": 3600
}
```

**Errors:**

- `401` - Invalid refresh token
- `401` - Refresh token expired

---

### POST /auth/logout

Invalidate refresh token (optional - tokens expire naturally).

**Headers:**

```
Authorization: Bearer <access_token>
```

**Response:** `200 OK`

```json
{
  "message": "Logged out successfully"
}
```

---

## Pairing Endpoints

### POST /pairing/generate

Generate QR pairing code for contractor.

**Headers:**

```
Authorization: Bearer <contractor_jwt>
```

**Request:**

```json
{
  "expiresIn": 1800
}
```

**Response:** `201 Created`

```json
{
  "pairingToken": "pair_abc123",
  "qrData": "gardenbuddy://pair/eyJhbGc...",
  "qrCodeUrl": "https://api.gardenbuddy.app/qr/pair_abc123.png",
  "shareUrl": "https://gardenbuddy.app/pair/pair_abc123",
  "expiresAt": "2025-01-22T11:00:00Z"
}
```

**Errors:**

- `403` - Client limit reached for tier
- `403` - Trial expired

---

### POST /pairing/request

Client requests pairing with contractor (scans QR).

**Headers:**

```
X-Device-ID: <client_device_id>
```

**Request:**

```json
{
  "pairingToken": "pair_abc123",
  "clientName": "Smith Family",
  "gardenPreview": {
    "plantCount": 12,
    "gardenSize": "Medium",
    "location": "London"
  }
}
```

**Response:** `201 Created`

```json
{
  "pairing": {
    "id": "pair_xyz789",
    "contractorId": "usr_abc123",
    "contractorName": "Green Thumb Gardens",
    "contractorLogo": "https://cdn.gardenbuddy.app/logos/...",
    "clientDeviceId": "dev_client123",
    "clientName": "Smith Family",
    "status": "active",
    "pairedAt": "2025-01-22T10:35:00Z"
  },
  "message": "Successfully connected to Green Thumb Gardens!"
}
```

**Errors:**

- `400` - Invalid pairing token
- `404` - Pairing token not found
- `410` - Pairing token expired
- `409` - Already paired

---

### GET /pairing/:pairingId

Get pairing details.

**Headers:**

```
Authorization: Bearer <contractor_jwt>
OR
X-Device-ID: <client_device_id>
```

**Response:** `200 OK`

```json
{
  "id": "pair_xyz789",
  "contractorId": "usr_abc123",
  "clientDeviceId": "dev_client123",
  "clientName": "Smith Family",
  "status": "active",
  "pairedAt": "2025-01-22T10:35:00Z",
  "lastSync": "2025-01-22T14:20:00Z",
  "jobCount": 5,
  "messageCount": 12
}
```

---

### DELETE /pairing/:pairingId

Disconnect pairing (either party can initiate).

**Headers:**

```
Authorization: Bearer <contractor_jwt>
OR
X-Device-ID: <client_device_id>
```

**Response:** `200 OK`

```json
{
  "message": "Pairing disconnected successfully",
  "pairingId": "pair_xyz789",
  "disconnectedAt": "2025-01-22T15:00:00Z"
}
```

---

## Client Endpoints

### GET /clients

List all paired clients for contractor.

**Headers:**

```
Authorization: Bearer <contractor_jwt>
```

**Query Parameters:**

```
?status=active          # Filter by status
?limit=20               # Results per page
?offset=0               # Pagination offset
?sort=pairedAt:desc     # Sort order
```

**Response:** `200 OK`

```json
{
  "clients": [
    {
      "pairingId": "pair_xyz789",
      "clientName": "Smith Family",
      "gardenDetails": "Rose Garden Estate",
      "status": "active",
      "healthStatus": "healthy",
      "nextJobDate": "2025-01-25",
      "pairedAt": "2025-01-22T10:35:00Z",
      "lastSync": "2025-01-22T14:20:00Z"
    }
  ],
  "total": 8,
  "limit": 20,
  "offset": 0
}
```

---

### GET /clients/:pairingId

Get detailed client information.

**Headers:**

```
Authorization: Bearer <contractor_jwt>
```

**Response:** `200 OK`

```json
{
  "pairingId": "pair_xyz789",
  "clientName": "Smith Family",
  "gardenDetails": "Rose Garden Estate",
  "location": "London",
  "status": "active",
  "pairedAt": "2025-01-22T10:35:00Z",
  "stats": {
    "totalJobs": 15,
    "completedJobs": 12,
    "upcomingJobs": 3,
    "totalRevenue": 1800,
    "lastJobDate": "2025-01-20"
  }
}
```

---

### PUT /clients/:pairingId

Update client details (contractor only).

**Headers:**

```
Authorization: Bearer <contractor_jwt>
```

**Request:**

```json
{
  "clientName": "Smith-Jones Family",
  "gardenDetails": "Extended rose garden with new vegetable patch",
  "notes": "Gate code: 1234"
}
```

**Response:** `200 OK`

```json
{
  "pairingId": "pair_xyz789",
  "clientName": "Smith-Jones Family",
  "gardenDetails": "Extended rose garden with new vegetable patch",
  "updatedAt": "2025-01-22T15:30:00Z"
}
```

---

## Job Endpoints

### POST /jobs

Create new job (contractor only).

**Headers:**

```
Authorization: Bearer <contractor_jwt>
```

**Request:**

```json
{
  "pairingId": "pair_xyz789",
  "service": "Lawn Treatment",
  "scheduledDate": "2025-01-25",
  "scheduledTime": "14:00",
  "duration": 120,
  "price": 150,
  "notes": "Apply spring fertilizer",
  "notifyClient": true
}
```

**Response:** `201 Created`

```json
{
  "job": {
    "id": "job_abc123",
    "pairingId": "pair_xyz789",
    "service": "Lawn Treatment",
    "scheduledDate": "2025-01-25",
    "scheduledTime": "14:00",
    "duration": 120,
    "price": 150,
    "status": "pending",
    "createdAt": "2025-01-22T15:45:00Z"
  },
  "syncedToClient": true,
  "clientNotified": true
}
```

**Errors:**

- `404` - Pairing not found
- `422` - Invalid date/time

---

### GET /jobs

List jobs (filtered by context).

**Headers:**

```
Authorization: Bearer <contractor_jwt>
OR
X-Device-ID: <client_device_id>
X-Pairing-ID: <pairing_id>
```

**Query Parameters:**

```
?pairingId=pair_xyz789  # Filter by client (contractor)
?status=pending         # Filter by status
?from=2025-01-01        # Date range start
?to=2025-01-31          # Date range end
?limit=20
?offset=0
```

**Response:** `200 OK`

```json
{
  "jobs": [
    {
      "id": "job_abc123",
      "service": "Lawn Treatment",
      "scheduledDate": "2025-01-25",
      "scheduledTime": "14:00",
      "status": "pending",
      "price": 150,
      "contractorName": "Green Thumb Gardens"
    }
  ],
  "total": 5,
  "limit": 20,
  "offset": 0
}
```

---

### GET /jobs/today

Get today's jobs for contractor.

**Headers:**

```
Authorization: Bearer <contractor_jwt>
```

**Response:** `200 OK`

```json
{
  "jobs": [
    {
      "id": "job_abc123",
      "clientName": "Smith Family",
      "service": "Lawn Treatment",
      "scheduledTime": "14:00",
      "status": "confirmed",
      "urgent": false,
      "address": "123 Garden St, London"
    }
  ],
  "total": 4,
  "totalRevenue": 600
}
```

---

### PUT /jobs/:jobId

Update job details.

**Headers:**

```
Authorization: Bearer <contractor_jwt>
```

**Request:**

```json
{
  "scheduledDate": "2025-01-26",
  "scheduledTime": "15:00",
  "status": "confirmed",
  "notes": "Client requested time change"
}
```

**Response:** `200 OK`

```json
{
  "job": {
    "id": "job_abc123",
    "scheduledDate": "2025-01-26",
    "scheduledTime": "15:00",
    "status": "confirmed",
    "updatedAt": "2025-01-22T16:00:00Z"
  },
  "syncedToClient": true
}
```

---

### DELETE /jobs/:jobId

Cancel/delete job.

**Headers:**

```
Authorization: Bearer <contractor_jwt>
```

**Response:** `200 OK`

```json
{
  "message": "Job cancelled successfully",
  "jobId": "job_abc123",
  "clientNotified": true
}
```

---

## Message Endpoints

### POST /messages

Send message (contractor or client).

**Headers:**

```
Authorization: Bearer <contractor_jwt>
OR
X-Device-ID: <client_device_id>
X-Pairing-ID: <pairing_id>
```

**Request:**

```json
{
  "pairingId": "pair_xyz789",
  "message": "Can we reschedule tomorrow's job to afternoon?",
  "attachments": []
}
```

**Response:** `201 Created`

```json
{
  "message": {
    "id": "msg_abc123",
    "pairingId": "pair_xyz789",
    "senderType": "client",
    "message": "Can we reschedule tomorrow's job to afternoon?",
    "sentAt": "2025-01-22T16:15:00Z",
    "readAt": null
  },
  "notified": true
}
```

---

### GET /messages

Get message history for a pairing.

**Headers:**

```
Authorization: Bearer <contractor_jwt>
OR
X-Device-ID: <client_device_id>
X-Pairing-ID: <pairing_id>
```

**Query Parameters:**

```
?pairingId=pair_xyz789  # Required for contractor
?limit=50
?offset=0
?unread=true           # Only unread messages
```

**Response:** `200 OK`

```json
{
  "messages": [
    {
      "id": "msg_abc123",
      "senderType": "client",
      "message": "Can we reschedule tomorrow's job to afternoon?",
      "sentAt": "2025-01-22T16:15:00Z",
      "readAt": "2025-01-22T16:20:00Z"
    },
    {
      "id": "msg_abc124",
      "senderType": "contractor",
      "message": "Of course! How about 3pm?",
      "sentAt": "2025-01-22T16:21:00Z",
      "readAt": null
    }
  ],
  "total": 24,
  "unreadCount": 1
}
```

---

### PUT /messages/:messageId/read

Mark message as read.

**Headers:**

```
Authorization: Bearer <contractor_jwt>
OR
X-Device-ID: <client_device_id>
```

**Response:** `200 OK`

```json
{
  "messageId": "msg_abc123",
  "readAt": "2025-01-22T16:25:00Z"
}
```

---

## Sync Endpoints

### GET /sync

Get updates for client (polling endpoint).

**Headers:**

```
X-Device-ID: <client_device_id>
X-Pairing-ID: <pairing_id>
```

**Query Parameters:**

```
?since=2025-01-22T16:00:00Z  # Only updates after this time
```

**Response:** `200 OK`

```json
{
  "jobs": [
    {
      "id": "job_abc123",
      "action": "created",
      "service": "Lawn Treatment",
      "scheduledDate": "2025-01-25",
      "scheduledTime": "14:00",
      "contractorName": "Green Thumb Gardens"
    }
  ],
  "messages": [
    {
      "id": "msg_abc124",
      "action": "created",
      "senderType": "contractor",
      "message": "Of course! How about 3pm?",
      "sentAt": "2025-01-22T16:21:00Z"
    }
  ],
  "lastSync": "2025-01-22T16:30:00Z",
  "hasMore": false
}
```

**Rate Limit:** 60 requests/hour (1 per minute recommended)

---

## Billing Endpoints

### GET /billing/status

Get subscription status for contractor.

**Headers:**

```
Authorization: Bearer <contractor_jwt>
```

**Response:** `200 OK`

```json
{
  "subscriptionTier": "standard",
  "status": "active",
  "trialEndsAt": null,
  "currentPeriodStart": "2025-01-01T00:00:00Z",
  "currentPeriodEnd": "2025-02-01T00:00:00Z",
  "cancelAtPeriodEnd": false,
  "clientCount": 8,
  "clientLimit": 20,
  "nextBillingDate": "2025-02-01",
  "amount": 2000,
  "currency": "gbp"
}
```

---

### POST /billing/checkout

Create Stripe checkout session for upgrade.

**Headers:**

```
Authorization: Bearer <contractor_jwt>
```

**Request:**

```json
{
  "tier": "standard",
  "successUrl": "https://app.gardenbuddy.app/success",
  "cancelUrl": "https://app.gardenbuddy.app/billing"
}
```

**Response:** `200 OK`

```json
{
  "sessionId": "cs_test_abc123",
  "url": "https://checkout.stripe.com/c/pay/cs_test_abc123"
}
```

**Errors:**

- `400` - Invalid tier
- `409` - Already on this tier

---

### POST /billing/portal

Get Stripe customer portal URL (manage subscription).

**Headers:**

```
Authorization: Bearer <contractor_jwt>
```

**Request:**

```json
{
  "returnUrl": "https://app.gardenbuddy.app/billing"
}
```

**Response:** `200 OK`

```json
{
  "url": "https://billing.stripe.com/p/session/abc123"
}
```

---

## Stats Endpoints

### GET /stats/dashboard

Get dashboard statistics for contractor.

**Headers:**

```
Authorization: Bearer <contractor_jwt>
```

**Response:** `200 OK`

```json
{
  "today": {
    "jobs": 4,
    "revenue": 600,
    "completedJobs": 2
  },
  "week": {
    "jobs": 18,
    "revenue": 2700,
    "completedJobs": 15
  },
  "month": {
    "jobs": 72,
    "revenue": 10800,
    "completedJobs": 65
  },
  "clients": {
    "total": 8,
    "active": 7,
    "inactive": 1
  },
  "subscription": {
    "tier": "standard",
    "daysRemaining": 15
  }
}
```

---

## Data Models

### User (Contractor)

```typescript
interface User {
  id: string;                    // usr_abc123
  email: string;
  businessName: string;
  location: string;
  logoUrl?: string;
  trialEndsAt: string | null;    // ISO 8601
  subscriptionTier: 'trial' | 'standard' | 'professional' | 'enterprise';
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  clientCount: number;
  createdAt: string;             // ISO 8601
  updatedAt: string;
}
```

### Pairing

```typescript
interface Pairing {
  id: string;                    // pair_xyz789
  contractorId: string;          // usr_abc123
  clientDeviceId: string;        // dev_client123
  clientName?: string;
  gardenPreview?: object;
  status: 'active' | 'paused' | 'disconnected';
  pairedAt: string;              // ISO 8601
  lastSync: string;
  metadata?: object;
}
```

### Job

```typescript
interface Job {
  id: string;                    // job_abc123
  contractorId: string;
  pairingId: string;
  service: string;
  scheduledDate: string;         // YYYY-MM-DD
  scheduledTime: string;         // HH:MM
  duration?: number;             // minutes
  price?: number;                // pence (150.00 = £1.50)
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled';
  urgent: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  syncedToClient: boolean;
  clientNotified: boolean;
}
```

### Message

```typescript
interface Message {
  id: string;                    // msg_abc123
  pairingId: string;
  senderType: 'contractor' | 'client';
  message: string;
  attachments?: string[];
  sentAt: string;                // ISO 8601
  readAt?: string;
}
```

---

## Webhooks

### Stripe Webhooks

**Endpoint:** `POST /webhooks/stripe`

**Events Handled:**

- `customer.subscription.created` - New subscription
- `customer.subscription.updated` - Tier change
- `customer.subscription.deleted` - Cancellation
- `invoice.payment_succeeded` - Payment received
- `invoice.payment_failed` - Payment failed

**Webhook Payload Example:**

```json
{
  "type": "customer.subscription.updated",
  "data": {
    "object": {
      "id": "sub_abc123",
      "customer": "cus_xyz789",
      "status": "active",
      "items": {
        "data": [{
          "price": {
            "id": "price_standard",
            "unit_amount": 2000
          }
        }]
      }
    }
  }
}
```

**Security:** Verify webhook signature using Stripe webhook secret.

---

## SDKs

### JavaScript/TypeScript

```bash
npm install @gardenbuddy/sdk
```

```typescript
import { GardenBuddyClient } from '@gardenbuddy/sdk';

const client = new GardenBuddyClient({
  apiKey: 'your_jwt_token',
  baseUrl: 'https://api.gardenbuddy.app'
});

// Create job
const job = await client.jobs.create({
  pairingId: 'pair_xyz789',
  service: 'Lawn Treatment',
  scheduledDate: '2025-01-25',
  scheduledTime: '14:00'
});

// Get clients
const clients = await client.clients.list();
```

### Python

```bash
pip install gardenbuddy
```

```python
from gardenbuddy import Client

client = Client(api_key='your_jwt_token')

# Create job
job = client.jobs.create(
    pairing_id='pair_xyz789',
    service='Lawn Treatment',
    scheduled_date='2025-01-25',
    scheduled_time='14:00'
)

# Get clients
clients = client.clients.list()
```

---

## Examples

### Complete Pairing Flow

```javascript
// CONTRACTOR SIDE (GardenManager Pro)

// 1. Generate pairing code
const response = await fetch('https://api.gardenbuddy.app/pairing/generate', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + contractorToken,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ expiresIn: 1800 })
});

const { qrData, shareUrl } = await response.json();
// Display QR code or share link to client


// CLIENT SIDE (GardenBuddy)

// 2. Client scans QR, extracts token
const pairingToken = extractTokenFromQR(qrData);

// 3. Request pairing
const pairResponse = await fetch('https://api.gardenbuddy.app/pairing/request', {
  method: 'POST',
  headers: {
    'X-Device-ID': deviceId,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    pairingToken: pairingToken,
    clientName: 'Smith Family',
    gardenPreview: {
      plantCount: 12,
      location: 'London'
    }
  })
});

const { pairing } = await pairResponse.json();
// Store pairing ID locally
localStorage.setItem('pairingId', pairing.id);
```

### Job Creation & Sync

```javascript
// CONTRACTOR: Create job
const job = await fetch('https://api.gardenbuddy.app/jobs', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + contractorToken,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    pairingId: 'pair_xyz789',
    service: 'Lawn Treatment',
    scheduledDate: '2025-01-25',
    scheduledTime: '14:00',
    price: 15000, // £150.00 in pence
    notifyClient: true
  })
});


// CLIENT: Poll for updates (every 60 seconds)
const sync = await fetch('https://api.gardenbuddy.app/sync', {
  headers: {
    'X-Device-ID': deviceId,
    'X-Pairing-ID': pairingId
  }
});

const { jobs, messages } = await sync.json();

// Add new jobs to calendar
jobs.forEach(job => {
  if (job.action === 'created') {
    addToCalendar(job);
    showNotification(`New job: ${job.service} on ${job.scheduledDate}`);
  }
});
```

### Billing Flow

```javascript
// Check subscription status
const status = await fetch('https://api.gardenbuddy.app/billing/status', {
  headers: { 'Authorization': 'Bearer ' + contractorToken }
});

const { subscriptionTier, clientCount, clientLimit } = await status.json();

if (clientCount >= clientLimit) {
  // Client limit reached - show upgrade prompt
  
  // Create checkout session
  const checkout = await fetch('https://api.gardenbuddy.app/billing/checkout', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + contractorToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      tier: 'professional',
      successUrl: 'https://app.gardenbuddy.app/success',
      cancelUrl: 'https://app.gardenbuddy.app/billing'
    })
  });
  
  const { url } = await checkout.json();
  
  // Redirect to Stripe checkout
  window.location.href = url;
}
```

---

## Versioning

**Current Version:** v1

**Breaking Changes:**

- Will be introduced as new version (v2)
- v1 will be maintained for 12 months after v2 release
- Deprecation warnings sent 6 months before sunset

**Non-Breaking Changes:**

- New endpoints added to existing version
- New optional fields added to responses
- New query parameters (optional)

---

## Support

**Documentation:** <https://docs.gardenbuddy.app>  
**API Status:** <https://status.gardenbuddy.app>  
**Support Email:** <api@gardenbuddy.app>  
**Developer Discord:** <https://discord.gg/gardenbuddy>

---

**Last Updated:** January 22, 2026
**API Version:** 1.0.0
