# PixelGenesis — Decentralized Identity & Credential Vault

**Web3 Self-Sovereign Identity (SSI) with DIDs, VCs, IPFS & Selective Disclosure**

> **No more oversharing.** Prove only what’s needed.

---

## Problem

To prove *"I'm over 18"*, you shouldn’t reveal:
- Full name
- Aadhaar
- Address
- Photo

**PixelGenesis fixes this.**

---

## Solution

A **3-role Web3 identity system**:

| Role | Description |
|------|-----------|
| **Issuer** | Validates docs → Issues signed **VCs** |
| **Citizen** | Owns DID + VCs → Shares **only needed claims** |
| **Verifier** | Requests proof → Verifies instantly |

---

## Tech Stack

- **Frontend**: React + TypeScript + Ethers.js + MetaMask
- **Backend**: Node.js + Express + Veramo + SQLite
- **Identity**: DIDs (`did:ethr`, `did:key`) + VCs (W3C)
- **Storage**: IPFS via [web3.storage](https://web3.storage)
- **Blockchain**: Polygon Mumbai + Solidity + Hardhat
- **Verification**: Veramo + on-chain hash + revocation

---

## Features

- [x] User-controlled wallet (MetaMask)
- [x] DID creation (`did:ethr:0x...`)
- [x] VC issuance & verification (Veramo)
- [x] IPFS document storage
- [x] **Selective disclosure** (share only `age`)
- [x] Smart contract anchoring
- [x] Revocation support
- [x] Boolean rule engine (`age >= 18`)
- [x] 3 clean dashboards

---

## Project Structure
/pixelgenesis
├── backend/
│   ├── src/
│   │   ├── agent/       # Veramo config
│   │   ├── routes/      # API endpoints
│   │   ├── db/          # SQLite schema
│   │   └── services/    # IPFS, VC, contract
├── frontend/
│   ├── src/pages/
│   │   ├── CitizenDashboard.tsx
│   │   ├── IssuerDashboard.tsx
│   │   └── VerifierDashboard.tsx
├── smart-contract/
│   ├── contracts/CredentialStore.sol
│   └── scripts/deploy.ts
└── README.md


---

## Demo Flow (60 sec)

1. **Citizen**: Connect wallet → Upload doc → Request VC
2. **Issuer**: Validate → Issue VC → Anchor on-chain
3. **Citizen**: Share proof → "Age ≥ 18" via QR
4. **Verifier**: Scan → Verify → **Access Granted**

---

## Security

- Keys stay in **MetaMask**
- Docs on **IPFS only**
- DB has **only metadata**
- VCs **cryptographically signed**
- Revocation **on-chain**

---

## Status

**MVP Complete**  
Ready for demo on **2 laptops**

---

## Built For

**Web3 Identity Buildathon**

> *"Your data. Your control. Your proof."*

---