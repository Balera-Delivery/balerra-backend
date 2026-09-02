# Balerra Delivery Management Platform - Backend API

Production-ready, type-safe RESTful API for the **Balerra Delivery Management Platform**, built using **Node.js, Express.js, TypeScript, PostgreSQL, and Prisma ORM**.

---

## 🚀 Key Features

1. **Role-Based Authentication & Authorization (RBAC)**:
   - **Customer**: Free self-registration with immediate activation. Login using **Email or Phone Number** + Password.
   - **Rider**: Self-registration starts as `PENDING_APPROVAL`. Cannot login until approved by Admin. Login using **Email** + Password.
   - **Admin**: Full administrative privileges; can provision both Customers and Riders directly.
2. **Delivery State Machine**:
   - `PENDING` ➔ `ASSIGNED` ➔ `ACCEPTED` ➔ `ARRIVED_AT_PICKUP` ➔ `PICKED_UP` ➔ `ON_THE_WAY` ➔ `DELIVERED` ➔ `COMPLETED` (or `CANCELLED`).
3. **6-Digit OTP Delivery Verification**:
   - Secure random 6-digit OTP generated upon delivery dispatch and stored in PostgreSQL.
   - Recipient shares OTP with Rider upon arrival. Verification transitions order to `COMPLETED`.
4. **Push Notifications (FCM) & In-App Activity**:
   - Firebase Cloud Messaging integration for real-time mobile push notifications.
   - In-app notification persistence in PostgreSQL with read/unread tracking.
5. **Admin Operations & Reports**:
   - Dashboard statistics: Total Customers, Active/Online/Offline Riders, Deliveries summary.
   - Customer & Rider management (Search, Edit, Suspend, Reactivate, Direct creation).
   - Operational Reports: Daily, Weekly, Monthly breakdown & Rider performance metrics.

---

## 🛠️ Tech Stack

- **Runtime**: Node.js (v20+)
- **Language**: TypeScript
- **Framework**: Express.js
- **Database**: PostgreSQL
- **ORM**: Prisma ORM
- **Authentication**: JWT (JSON Web Tokens) & bcryptjs
- **Push Notifications**: Firebase Admin SDK
- **Validation**: Zod
- **API Documentation**: Swagger UI (OpenAPI 3.0)

---

## 📖 Swagger / OpenAPI Documentation

Once the server is running, you can access the interactive API documentation and test endpoints directly from the browser:
- **Swagger UI**: [http://localhost:5000/api-docs](http://localhost:5000/api-docs) (or [http://localhost:5000/docs](http://localhost:5000/docs))
- **OpenAPI Schema JSON**: [http://localhost:5000/swagger.json](http://localhost:5000/swagger.json)

---

## 📂 Project Structure

```
balerra-backend/
├── prisma/
│   ├── schema.prisma            # Relational database schema with Enums
│   └── seed.ts                  # Seeds default Super Admin & system settings
├── src/
│   ├── config/
│   │   ├── env.ts               # Environment variable loader
│   │   ├── prisma.ts            # Prisma client instance
│   │   └── firebase.ts          # Firebase Admin SDK initialization
│   ├── constants/
│   │   ├── deliveryStatus.ts    # Delivery lifecycle status enum
│   │   ├── roles.ts             # User roles & account status enums
│   │   └── httpCodes.ts         # Standard HTTP status codes
│   ├── controllers/
│   │   ├── auth.controller.ts   # Registration, Login, Profile & FCM token
│   │   ├── customer.controller.ts# Customer delivery requests, tracking & profile
│   │   ├── rider.controller.ts  # Availability, assignments, status updates & OTP
│   │   ├── admin.controller.ts  # Customer/Rider CRUD, Dispatch, Settings
│   │   └── notification.controller.ts # Notification management
│   ├── middleware/
│   │   ├── auth.middleware.ts   # JWT authentication & account status checks
│   │   ├── role.middleware.ts   # Role-based access control (RBAC)
│   │   ├── validate.middleware.ts # Zod request validation
│   │   └── error.middleware.ts  # Global error & 404 handlers
│   ├── routes/
│   │   ├── auth.routes.ts       # /api/v1/auth
│   │   ├── customer.routes.ts   # /api/v1/customer
│   │   ├── rider.routes.ts      # /api/v1/rider
│   │   ├── admin.routes.ts      # /api/v1/admin
│   │   ├── notification.routes.ts # /api/v1/notifications
│   │   └── index.ts             # Root router
│   ├── services/
│   │   ├── auth.service.ts
│   │   ├── customer.service.ts
│   │   ├── rider.service.ts
│   │   ├── delivery.service.ts
│   │   ├── otp.service.ts
│   │   ├── admin.service.ts
│   │   ├── notification.service.ts
│   │   └── report.service.ts
│   ├── utils/
│   │   ├── apiResponse.ts       # Standardized API response format
│   │   ├── otpGenerator.ts      # 6-digit random number generator
│   │   ├── trackingCode.ts      # Unique tracking code generator (BAL-YYYY-XXXXXX)
│   │   └── jwt.ts               # JWT signing & decoding
│   ├── validations/             # Zod input validation schemas
│   ├── app.ts                   # Express app setup & middleware
│   └── server.ts                # Server bootstrap with DB connectivity check
├── .env.example
├── .env
├── package.json
└── tsconfig.json
```

---

## ⚙️ Getting Started

### 1. Prerequisites
- Node.js (v20 or higher)
- PostgreSQL running locally or remotely

### 2. Setup Environment
Ensure your `.env` file contains your database connection string:
```env
PORT=5000
NODE_ENV=development
DATABASE_URL="postgresql://postgres:fayo@localhost:5432/balera_delivery?schema=public"
JWT_SECRET="balerra_delivery_jwt_super_secret_key_2026_xYz"
JWT_EXPIRES_IN="7d"
FIREBASE_SERVICE_ACCOUNT_PATH="./firebase-service-account.json"
DEFAULT_ADMIN_EMAIL="admin@balera.com"
DEFAULT_ADMIN_PASSWORD="AdminPassword@123"
DEFAULT_ADMIN_NAME="Super Administrator"
```

### 3. Database Migration & Seeding
```bash
# Push schema to PostgreSQL
npm run prisma:push

# (Optional) Run migrations
npm run prisma:migrate

# Seed default Super Admin & System settings
npm run prisma:seed
```

### 4. Run the Development Server
```bash
npm run dev
```

Server runs on: `http://localhost:5000`

---

## 📡 API Endpoints Overview

All responses follow the standard SRS format:
- **Success**: `{ "success": true, "message": "...", "data": { ... } }`
- **Error**: `{ "success": false, "message": "...", "error": { ... } }`

### 🔑 Authentication (`/api/v1/auth`)
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/v1/auth/register` | Customer registration (Active immediately) |
| `POST` | `/api/v1/auth/login` | Customer login (Phone or Email + Password) |
| `POST` | `/api/v1/auth/rider/register` | Rider registration (Starts as `PENDING_APPROVAL`) |
| `POST` | `/api/v1/auth/rider/login` | Rider login (Email + Password, requires `ACTIVE` status) |
| `POST` | `/api/v1/auth/admin/login` | Admin login |
| `GET` | `/api/v1/auth/me` | Get active user profile |
| `PUT` | `/api/v1/auth/change-password` | Change password |
| `PUT` | `/api/v1/auth/fcm-token` | Update device push notification token |

### 👤 Customer Endpoints (`/api/v1/customer`)
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/v1/customer/deliveries` | Create a delivery request (generates 6-digit OTP & tracking code) |
| `GET` | `/api/v1/customer/deliveries` | List customer's deliveries |
| `GET` | `/api/v1/customer/deliveries/:id` | View delivery details |
| `GET` | `/api/v1/customer/deliveries/:id/otp`| View 6-digit OTP for delivery completion |
| `POST` | `/api/v1/customer/deliveries/:id/cancel`| Cancel delivery request |
| `GET` | `/api/v1/customer/profile` | Get customer profile |
| `PUT` | `/api/v1/customer/profile` | Update customer profile |
| `GET` | `/api/v1/customer/notifications` | View customer notifications |

### 🛵 Rider Endpoints (`/api/v1/rider`)
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `PUT` | `/api/v1/rider/status` | Toggle `ONLINE` / `OFFLINE` status |
| `GET` | `/api/v1/rider/assigned` | View assigned deliveries |
| `GET` | `/api/v1/rider/active` | Get currently ongoing delivery |
| `POST` | `/api/v1/rider/deliveries/:id/accept` | Accept assigned delivery |
| `POST` | `/api/v1/rider/deliveries/:id/reject` | Reject delivery assignment |
| `PUT` | `/api/v1/rider/deliveries/:id/status` | Update progress (`ARRIVED_AT_PICKUP`, `PICKED_UP`, `ON_THE_WAY`, `DELIVERED`) |
| `POST` | `/api/v1/rider/deliveries/:id/verify-otp`| Verify 6-digit OTP & mark `COMPLETED` |
| `GET` | `/api/v1/rider/history` | View completed delivery history |
| `GET` | `/api/v1/rider/profile` | View rider profile |
| `PUT` | `/api/v1/rider/profile` | Update rider profile |

### 🛡️ Admin Endpoints (`/api/v1/admin`)
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v1/admin/dashboard` | Dashboard metrics & stats |
| `GET` | `/api/v1/admin/customers` | Search & list customers |
| `POST` | `/api/v1/admin/customers` | Admin direct customer registration |
| `GET` | `/api/v1/admin/customers/:id` | View customer & delivery history |
| `PUT` | `/api/v1/admin/customers/:id` | Update customer details |
| `PATCH`| `/api/v1/admin/customers/:id/status`| Suspend / Reactivate customer |
| `GET` | `/api/v1/admin/riders` | Search & list riders (filter by online/offline/pending) |
| `POST` | `/api/v1/admin/riders` | Admin direct rider registration |
| `GET` | `/api/v1/admin/riders/:id` | Rider details & performance stats |
| `PATCH`| `/api/v1/admin/riders/:id/approve` | **Approve pending rider registration** |
| `PATCH`| `/api/v1/admin/riders/:id/status` | Suspend / Reactivate rider |
| `PUT` | `/api/v1/admin/riders/:id` | Update rider details |
| `GET` | `/api/v1/admin/deliveries` | List & filter all deliveries |
| `GET` | `/api/v1/admin/deliveries/:id` | Delivery details & status logs |
| `PUT` | `/api/v1/admin/deliveries/:id/assign`| Assign online rider |
| `PUT` | `/api/v1/admin/deliveries/:id/reassign`| Reassign to another rider |
| `POST` | `/api/v1/admin/deliveries/:id/cancel`| Cancel delivery with reason |
| `GET` | `/api/v1/admin/reports` | Daily/Weekly/Monthly reports & rider metrics |
| `GET` | `/api/v1/admin/settings` | Get system configuration settings |
| `PUT` | `/api/v1/admin/settings` | Update system configuration settings |

### 🔔 Notification Endpoints (`/api/v1/notifications`)
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v1/notifications` | Get user notifications |
| `PUT` | `/api/v1/notifications/:id/read` | Mark notification as read |
| `PUT` | `/api/v1/notifications/read-all` | Mark all notifications as read |
| `POST` | `/api/v1/notifications/send` | Admin send targeted / broadcast notification |
