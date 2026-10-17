# WhatsApp Web Clone — Production-Quality Full-Stack Application

A production-ready WhatsApp Web clone engineered with vanilla HTML5, CSS3, and JavaScript on the frontend, powered by a Node.js/Express.js backend, MongoDB/Mongoose persistence, Socket.IO real-time event streaming, and WebRTC peer-to-peer calling.

---

## Features

- **Authentication & Security:**
  - Secure registration, login, session revocation, and logout.
  - Password hashing with bcrypt (12 salt rounds).
  - JWT access tokens and refresh tokens stored in HTTP-only, SameSite cookies.
  - Helmet security headers, CORS allowlist, and XSS output encoding.
  - Login rate limiting and account enumeration protection.
  - NoSQL injection defenses with strict type validation.

- **Real-Time 1-to-1 Messaging:**
  - Instant message delivery via Socket.IO with REST API fallback.
  - Persistent message history in MongoDB with cursor-based pagination.
  - Optimistic UI updates with client-generated idempotency keys (`clientMessageId`).
  - Message states: sending (clock), sent (single tick), delivered (double gray tick), and read (double blue tick).
  - Quoted message replies.
  - In-place message editing (within 15 minutes) and deletion (for self or for everyone).
  - Real-time typing indicators and presence tracking (online/last seen timestamps).
  - Date separators (Today, Yesterday, Date).

- **Group Messaging:**
  - Create groups with name, description, avatar, and multiple participants.
  - Admin role enforcement (only admins can edit group metadata or add/remove members).
  - Member management and system audit messages ("Alice created group", "Bob was added").
  - Leave group and delete group handling.

- **Media & Voice Notes:**
  - Image and video attachments with responsive previews and full-screen lightbox.
  - Document sharing with file size indicators and download links.
  - Built-in Voice Note recording using browser `MediaRecorder` API with live timer, cancel, preview, and custom audio player.
  - Server-side MIME validation, size limits (25MB default), and safe randomized filename generation.
  - Local disk storage with automatic Cloudinary provider fallback.

- **WebRTC Audio & Video Calling:**
  - 1-to-1 voice and video calling.
  - Call state machine: calling, incoming, connected, ended.
  - Socket.IO signaling relay for SDP offers, answers, and ICE candidates.
  - In-call controls: mute microphone, disable video camera, and hang up.

- **Status (Stories):**
  - Create 24-hour disappearing text statuses with customizable background colors or photo statuses.
  - Full-screen animated story viewer with auto-progressing timer bar and viewer counts.

- **Settings & Customization:**
  - Profile customization (display name, about/bio, avatar).
  - Privacy controls (last seen, profile photo, read receipts toggle).
  - Light and Dark themes with seamless switching.
  - Chat wallpapers (Default WhatsApp, Solid Dark, Doodle, Deep Blue, Deep Green).
  - Blocked contacts management (block/unblock).
  - Password change and permanent account deletion.

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Vanilla HTML5, CSS3 (CSS Variables, Grid, Flexbox), Modular Vanilla JavaScript (ES6+) |
| **Backend** | Node.js, Express.js |
| **Database** | MongoDB with Mongoose ODM |
| **Real-Time** | Socket.IO |
| **Calling** | WebRTC with STUN configuration |
| **Security** | Helmet, CORS, Cookie-Parser, Express-Rate-Limit, JsonWebToken, Bcrypt.js |
| **Testing** | Jest, Supertest |

---

## Directory Structure

```text
whatsapp-clone/
├── client/                     # Plain HTML5, CSS3, Vanilla JS frontend
│   ├── css/
│   │   ├── variables.css       # Design tokens, color palette, dark mode variables
│   │   ├── reset.css           # Modern box-sizing reset & scrollbars
│   │   ├── layout.css          # Grid container, navigation rail, sidebar, viewport
│   │   ├── components.css      # Bubbles, cards, modals, composer, call overlay
│   │   ├── responsive.css      # Tablet & mobile sliding views
│   │   └── themes.css          # Light/dark & chat wallpaper themes
│   ├── js/
│   │   ├── app.js              # Application orchestrator
│   │   ├── api.js              # REST API client wrapper
│   │   ├── auth.js             # Authentication & session handling
│   │   ├── socket.js           # Real-time Socket.IO event client
│   │   ├── chats.js            # Sidebar, conversation filtering & selection
│   │   ├── messages.js         # Chat history, bubbles, composer, ticks, replies
│   │   ├── contacts.js         # Contact search & starting new chats
│   │   ├── groups.js           # Group creation & member management
│   │   ├── media.js            # Uploads, lightbox & voice note recording
│   │   ├── webrtc.js           # WebRTC voice/video calling signaling
│   │   ├── status.js           # 24-hour status stories player
│   │   ├── settings.js         # Settings, privacy controls & theme toggle
│   │   ├── notifications.js    # Audio chime synthesizer & push notifications
│   │   └── utils.js            # Formatting, escaping, toasts, debounce
│   └── index.html              # Main single-page application entry point
├── server/
│   ├── src/
│   │   ├── config/             # DB connection, constants & socket events
│   │   ├── controllers/        # Express route business logic
│   │   ├── middleware/         # Auth, upload, rate limiters, error handling
│   │   ├── models/             # Mongoose schemas (User, Conversation, Message, Status, Session, Call)
│   │   ├── routes/             # Versioned REST API endpoints (/api/v1)
│   │   ├── services/           # Socket singleton, storage service
│   │   ├── sockets/            # Socket.IO connection, chat, presence, call handlers
│   │   ├── utils/              # JWT tokens, sanitization helpers
│   │   ├── validators/         # Request body validation middleware
│   │   ├── app.js              # Express app configuration & middleware
│   │   └── server.js           # Server startup, HTTP & Socket.IO initialization
│   └── tests/                  # Automated test suites
│       ├── auth.test.js        # Auth, duplicate check, cookies
│       ├── messaging.test.js   # 1-to-1 chat, persistence, idempotency
│       ├── groups.test.js      # Group creation, permissions, member removal
│       └── security.test.js    # NoSQL injection, XSS escaping, ID validation
├── uploads/                    # Uploaded media storage
├── .env.example                # Documented configuration template
├── package.json
└── README.md
```

---

## Installation & Setup

### Prerequisites

- **Node.js**: v18.0.0 or later
- **MongoDB**: Local MongoDB instance running on `localhost:27017` or a MongoDB Atlas connection URI

### 1. Clone & Install Dependencies

```bash
git clone <repository-url>
cd "whatsapp clone"
npm install
```

### 2. Configure Environment Variables

Copy the example environment configuration to `.env`:

```bash
cp .env.example .env
```

Verify the values in `.env`:

```ini
PORT=5000
NODE_ENV=development
CLIENT_ORIGIN=http://localhost:5000
MONGODB_URI=mongodb://127.0.0.1:27017/whatsapp_clone
JWT_ACCESS_SECRET=your_super_secret_access_key
JWT_REFRESH_SECRET=your_super_secret_refresh_key
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d
COOKIE_SECURE=false
COOKIE_SAME_SITE=lax
STORAGE_PROVIDER=local
MAX_FILE_SIZE_MB=25
ICE_SERVERS=[{"urls":["stun:stun.l.google.com:19302","stun:stun1.l.google.com:19302"]}]
```

### 3. Run Automated Tests

To run the complete automated test suite (22 tests across auth, messaging, groups, and security):

```bash
npm test
```

### 4. Start the Application

To start the server:

```bash
npm start
```

Or for development with automatic file restart:

```bash
npm run dev
```

Open your browser at: **`http://localhost:5000`**

---

## REST API Documentation

All API routes are versioned under `/api/v1`.

### Authentication (`/api/v1/auth`)

| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `POST` | `/auth/register` | Register new account with displayName, username, password | No |
| `POST` | `/auth/login` | Login with identifier and password | No |
| `POST` | `/auth/logout` | Revoke session and clear HTTP-only cookies | Yes |
| `GET` | `/auth/me` | Fetch currently logged-in user profile | Yes |
| `POST` | `/auth/refresh` | Rotate access token using refresh token cookie | No |
| `POST` | `/auth/change-password`| Change current user password | Yes |
| `DELETE`| `/auth/delete-account` | Permanently delete user account | Yes |

### Users (`/api/v1/users`)

| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `GET` | `/users/search?query=` | Search registered users by username or name | Yes |
| `GET` | `/users/:userId` | Get user public profile respecting privacy rules | Yes |
| `PATCH`| `/users/me` | Update name, about, avatar, privacy, or theme | Yes |
| `GET` | `/users/me/blocked` | Get list of contacts blocked by current user | Yes |
| `POST` | `/users/:userId/block` | Block a user | Yes |
| `DELETE`| `/users/:userId/block`| Unblock a user | Yes |

### Conversations (`/api/v1/conversations`)

| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `GET` | `/conversations` | Get all active conversations with lastMessage & unread count | Yes |
| `POST` | `/conversations` | Start or get existing direct conversation with recipientId | Yes |
| `GET` | `/conversations/:id` | Get single conversation details | Yes |
| `PATCH`| `/conversations/:id` | Update conversation settings (pin, archive, mute) | Yes |
| `DELETE`| `/conversations/:id`| Delete conversation for current user | Yes |
| `GET` | `/conversations/:id/messages` | Cursor-paginated message history (`?before=&limit=`) | Yes |
| `POST` | `/conversations/:id/messages` | Send message with content, attachment, or replyTo | Yes |
| `POST` | `/conversations/:id/read` | Mark all unread messages in conversation as read | Yes |

### Messages (`/api/v1/messages`)

| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `PATCH`| `/messages/:id` | Edit message content (sender only, within 15 min) | Yes |
| `DELETE`| `/messages/:id` | Delete message for me or for everyone | Yes |

### Groups (`/api/v1/groups`)

| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `POST` | `/groups` | Create group with name, description, avatar, members | Yes |
| `PATCH`| `/groups/:id` | Update group subject or description (Admin only) | Yes |
| `POST` | `/groups/:id/members` | Add members to group (Admin only) | Yes |
| `DELETE`| `/groups/:id/members/:userId` | Remove member from group (Admin only) | Yes |
| `POST` | `/groups/:id/leave` | Leave group | Yes |

### Media & Status (`/api/v1/media`, `/api/v1/statuses`)

| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `POST` | `/media/upload` | Upload image, video, audio, or document | Yes |
| `POST` | `/statuses` | Post text or photo status (24-hour expiration) | Yes |
| `GET` | `/statuses` | Get active statuses from contacts and self | Yes |
| `POST` | `/statuses/:id/view` | Mark status as viewed by current user | Yes |
| `DELETE`| `/statuses/:id` | Delete user status | Yes |

---

## Socket.IO Real-Time Contract

Sockets are authenticated during the handshake via the `accessToken` cookie.

### Client to Server Events

- `conversation:join` — Join a conversation room `conversation:${id}`.
- `conversation:leave` — Leave a conversation room.
- `message:send` — Send a message payload.
- `message:delivered` — Acknowledge message delivery to recipient client.
- `message:read` — Acknowledge reading messages in a conversation.
- `typing:start` — Broadcast typing indicator to conversation participants.
- `typing:stop` — Clear typing indicator.
- `call:invite` — Invite contact to audio or video call.
- `call:accept` — Accept incoming call.
- `call:reject` — Reject incoming call.
- `call:end` — End active or pending call.
- `webrtc:signal` — Relay SDP offers, answers, and ICE candidates.

### Server to Client Events

- `message:new` — Emits newly created message to conversation room.
- `message:status` — Emits status updates (sent -> delivered -> read).
- `message:updated` — Emits edited message to conversation room.
- `message:deleted` — Emits message deletion to conversation room.
- `typing:update` — Emits typing state changes (`isTyping: true/false`).
- `presence:update` — Emits user online state (`isOnline: true/false`, `lastSeen`).
- `conversation:updated` — Emits conversation order update to affected users.
- `call:incoming` — Notifies recipient of incoming call.
- `call:accepted` — Notifies caller that call was accepted.
- `call:rejected` — Notifies caller that call was rejected.
- `call:ended` — Notifies peer that call was terminated.
- `webrtc:signal` — Relays WebRTC signaling payload to destination peer.

---

## Security Architecture

1. **Password Security:** Salted hashes generated using `bcrypt` with 12 rounds. Plaintext passwords are never logged or stored.
2. **Token Security:** Short-lived access tokens (15m) and long-lived refresh tokens (7d) stored in `httpOnly`, `SameSite: Lax` cookies, protecting against XSS token extraction.
3. **Content Security Policy (CSP):** Strict helmet CSP rules restrict script and style sources to self and trusted CDNs.
4. **XSS Prevention:** All user-supplied strings are sanitized and escaped before rendering in the DOM.
5. **NoSQL Injection Resistance:** Path parameters and identifiers are verified as valid ObjectIDs before database queries. Query parameters are explicitly typed.
6. **File Upload Hardening:** Strict MIME-type allowlist, file size enforcement (25MB max), and randomized filenames prevent path traversal.

---

## Verification & Acceptance Checklist

- [x] Two separate users can register, log in, and establish sessions.
- [x] Both users can exchange messages in real time with optimistic UI updates.
- [x] Messages persist permanently in MongoDB across server restarts.
- [x] Message delivery ticks update dynamically: single tick (sent), double gray (delivered), double blue (read).
- [x] Typing indicators and presence status (online/last seen) update in real time.
- [x] Group messaging enforces backend admin permissions for adding/removing members.
- [x] Media attachments (images, documents, videos, audio notes) upload and display correctly.
- [x] Voice notes record with `MediaRecorder` and playback with progress tracking.
- [x] WebRTC calling signaling coordinates voice and video call workflows.
- [x] Status (stories) module supports text and media with 24h expiration and view counts.
- [x] Desktop and mobile responsive layouts adapt seamlessly.
- [x] Automated test suite passes with 22/22 green assertions.
- [x] Vercel serverless deployment configured with database connection caching and real-time REST polling fallback.

---

## Deploying to Vercel

The application is pre-configured for seamless Vercel deployment using `vercel.json` and the serverless bridge in `api/index.js`.

### 1. Prerequisites
- A free **[MongoDB Atlas](https://www.mongodb.com/cloud/atlas)** cluster (since Vercel lambdas run in the cloud and cannot connect to your local `localhost:27017` database).
- *(Optional)* A free **[Cloudinary](https://cloudinary.com)** account for permanent media attachment storage.

### 2. Deploy Steps

#### Option A: Deploy via GitHub (Recommended)
1. Initialize git and push to GitHub:
   ```bash
   git init
   git add .
   git commit -m "Production WhatsApp Web Clone"
   git remote add origin https://github.com/<your-username>/whatsapp-web-clone.git
   git push -u origin main
   ```
2. Navigate to **[vercel.com/new](https://vercel.com/new)** and import your repository.
3. In **Environment Variables**, add the following:
   - `MONGODB_URI`: `mongodb+srv://<username>:<password>@<cluster>.mongodb.net/whatsapp_clone?retryWrites=true&w=majority`
   - `JWT_ACCESS_SECRET`: `<any-strong-random-key>`
   - `JWT_REFRESH_SECRET`: `<any-strong-random-key>`
   - `NODE_ENV`: `production`
   - `COOKIE_SECURE`: `true`
   - *(Optional for permanent media)* `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
4. Click **Deploy**.

#### Option B: Deploy via Vercel CLI
```bash
npx vercel
```
Set the environment variables in the Vercel dashboard, then run:
```bash
npx vercel --prod
```

### 3. Serverless Architecture Highlights
- **Persistent DB Connection Pooling:** `global.mongoose` connection caching in `server/src/config/database.js` avoids MongoDB connection pool exhaustion on cold starts.
- **Dual Real-Time Sync:** Because Vercel serverless lambdas do not maintain continuous WebSocket connections, the frontend automatically switches to a high-frequency REST background sync (`Messages.syncNewMessages()` every 3.5s) to guarantee zero missed messages, seamless chatting, and read receipt updates.
- **Serverless Safe Storage:** Media handlers route to `/tmp` in `process.env.VERCEL` to prevent `EROFS` read-only errors, backed by Cloudinary CDN integration and Base64 DataURI fallbacks.

