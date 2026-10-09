# 🍽️ MealMate

**Meal tracking, expense logging, and automatic monthly settlement for shared households: hostels, student messes, and flatmates.**

No more paper logs, spreadsheet errors, or end-of-month arguments. Members log meals, managers log expenses, and MealMate calculates who owes what, in real time.

---

## 📑 Table of Contents

- [The Problem](#-the-problem)
- [Features](#-features)
  - [Meal Attendance](#-meal-attendance)
  - [Expenses & Deposits](#-expenses--deposits)
  - [Automated Settlement](#-automated-settlement)
  - [Role-Based Access](#-role-based-access)
  - [Notifications](#-notifications)
- [Tech Stack](#-tech-stack)
- [Getting Started](#-getting-started)
  - [Prerequisites](#prerequisites)
  - [Clone](#1-clone)
  - [Configure environment](#2-configure-environment)
  - [Install and run](#3-install-and-run)
- [Project Structure](#-project-structure)
- [Why MealMate](#-why-mealmate)
- [Contributing](#-contributing)
- [Author](#-author)

---

## 🎯 The Problem

Managing a shared mess by hand usually means:

- **Math errors** when totaling dozens of meal and expense entries
- **No transparency** over who deposited, who bought what, and who ate how much
- **Friction** when calculating dues and refunds at month-end

MealMate replaces that with one shared, transparent ledger.

---

## ✨ Features

### 🍛 Meal Attendance
- Turn **breakfast / lunch / dinner** on or off ahead of time
- Daily grid of every member's meal count, so cooks know the exact headcount and food waste drops

### 💰 Expenses & Deposits
- Log **bazar (market) expenses** with cost, buyer, date, and description
- Track each member's **advance deposits** into the mess fund
- Every member can see every entry, which gives a full **audit trail**

### 🧮 Automated Settlement
The ledger updates continuously:

| Metric | Formula |
|---|---|
| **Meal rate** | Total expenses ÷ Total meals |
| **Member cost** | Member's meals × Meal rate |
| **Net balance** | Member's deposits − Member cost |

A positive balance is credit carried forward. A negative balance is what the member owes the fund.

### 🔐 Role-Based Access

| Role | Can do |
|---|---|
| **Manager / Admin** | Create mess groups, approve/edit expense receipts, set meal deadlines, finalize monthly billing |
| **Member** | Set own meal preferences, view meals and market logs, check personal financial summary |

### 🔔 Notifications
Stay informed without checking the app all day. Members and managers get alerts for the events that matter:

| Event | Who gets notified |
|---|---|
| ⏰ Meal deadline approaching | Members who haven't confirmed tomorrow's meals |
| 🧾 New expense logged | All members in the mess |
| 💵 Deposit recorded | The depositing member and the manager |
| ⚠️ Low balance | Members whose balance falls below the set threshold |
| ✏️ Expense edited or deleted | All members (keeps the audit trail honest) |
| 📅 Monthly bill finalized | All members, with their final balance |

- Notifications appear in an in-app **notification center** with unread badges and a "mark all as read" option
- Members can **turn individual alert types on or off** from their settings
- Managers can set the **meal deadline** and **low-balance threshold** that trigger alerts

---

## 🧰 Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React / Next.js, responsive for desktop and mobile |
| Backend | Node.js + Express (REST API) |
| Database | MongoDB with Mongoose |
| Auth | JWT sessions, passwords hashed with bcrypt |

**Architecture:** decoupled client–server. The frontend talks to the Express API, which handles auth, business logic, calculations, and database access.

```
┌──────────────┐   REST / JSON   ┌───────────────┐        ┌───────────┐
│  React/Next  │ ──────────────► │ Express API   │ ─────► │  MongoDB  │
│  (client)    │ ◄────────────── │ JWT · bcrypt  │ ◄───── │ (Mongoose)│
└──────────────┘                 └───────────────┘        └───────────┘
```

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- MongoDB (local instance or Atlas URI)

### 1. Clone

```bash
git clone https://github.com/fmfuad0/mealmate-dev.git
cd mealmate-dev
```

### 2. Configure environment

Create a `.env` file in the backend folder:

```env
PORT=5000
MONGO_URI=<your-mongodb-connection-string>
JWT_SECRET=<a-long-random-string>
```

### 3. Install and run

```bash
# Backend
cd server
npm install
npm run dev

# Frontend (new terminal)
cd client
npm install
npm run dev
```

Open the URL printed by the frontend (typically `http://localhost:3000`).

---

## 📂 Project Structure

```
mealmate-dev/
├── client/     # React / Next.js frontend
└── server/     # Express API, models, controllers, routes
```

---

## 💡 Why MealMate

- **Transparent:** everyone sees every receipt and meal record
- **Fast:** monthly calculations that took hours are now instant
- **Less waste:** advance meal scheduling gives cooks accurate headcounts

---

## 🤝 Contributing

Issues and pull requests are welcome. Fork the repo, create a feature branch, and open a PR describing your change.

## 👤 Author

**Md. Fartin Mahtadi Fuad** · [GitHub](https://github.com/fmfuad0)
