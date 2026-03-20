# FluxLend - Frontend/Backend Workspace

Project is now split into separate apps:

- `frontend/` -> Next.js UI
- `dashboard-frontend/` -> standalone analytics dashboard UI
- `backend/` -> Express + PostgreSQL analytics API

## Run

Backend:

```bash
cd backend
npm install
npm run dev
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000` (or the Next.js port shown in terminal).

Standalone dashboard frontend:

```bash
cd dashboard-frontend
npm install
npm run dev
```

Open `http://localhost:3000` (or next available port) for the dashboard app.

## Optional Root Scripts

From workspace root:

```bash
npm run dev:backend
npm run dev:frontend
npm run dev:dashboard
```

## Product Flow

`Home -> Signup -> Login -> Dashboard -> Apply for Loan -> Loan Confirmation`

Extended journeys:

`Dashboard -> Eligibility Checker -> Loan Offers -> Apply`

`Dashboard -> Application Status Tracker`

`Dashboard -> Profile -> Update`

## Key Features

- Home, Signup, Login, Dashboard, Apply Loan (multi-step), Confirmation pages
- Simulated auth and loan submission via `localStorage`
- Multi-step application form:
	- Step 1: Personal details
	- Step 2: Employment details
	- Step 3: Loan details
	- Step 4: Review and submit
- Analytics hook placeholders via `trackEvent(...)`
- Extra event generators:
	- View Loan Offers page and offer comparison
	- Eligibility checker flow
	- EMI calculator widget
	- Notifications dropdown
	- Support chat modal
	- Application status tracker
	- Profile update journey
	- Delayed recommended offers loader

## Structure

- `frontend/pages/`
- `dashboard-frontend/pages/`
- `frontend/components/`
- `frontend/hooks/`
- `frontend/utils/analytics.js`
- `backend/routes/`
- `backend/controllers/`
- `backend/services/`
