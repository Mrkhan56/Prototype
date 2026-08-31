# CaseVault — Secure Digital Document Management System

A high-assurance, tamper-evident legal document management platform engineered for statutory chain of custody, cryptographic integrity verification, multi-level role-based access control (RBAC), and configurable approval workflows.

---

## 🌟 Key Features

- **🛡️ Cryptographic Chain of Custody**: SHA-256 hash tracking and validation on every document view, upload, export, or transition.
- **📜 Court-Ready PDF Certification**: Generates Section 65B certified audit trail reports with cryptographic timestamping.
- **🔒 Fine-Grained Access Control (RBAC)**: Enforces security classification levels (`UNCLASSIFIED`, `RESTRICTED`, `CONFIDENTIAL`, `SECRET`) and real-time response-layer field redactions.
- **⚡ Approval State Machine**: Configurable statutory pipelines (e.g. Charge Sheet approval workflows) with SLA timer counters.
- **🔍 Full-Text OCR & Faceted Search**: Multi-parameter search across case numbers, titles, depositions, and OCR text extracts.
- **🎨 Editorial Interface**: Modern interface tailored with deep slate navigation, warm amber accents, and serif display typography.

---

## 🏗️ Architecture

- **Frontend**: React 18, TypeScript, TailwindCSS, Vite, Lucide Icons, React Query, `@react-pdf/renderer`
- **Backend**: FastAPI, Python 3.11+, SQLAlchemy, PostgreSQL with Row-Level Security (RLS) policies
- **Security & Integrity**: Web Crypto API, ClamAV antivirus simulation, SHA-256 immutable version chaining

---

## 🚀 Quick Start

### 1. Frontend
```bash
cd frontend
npm install
npm run dev
```

### 2. Backend
```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

---

## 📄 License
MIT License
