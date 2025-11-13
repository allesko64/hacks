Phase 1 — Veramo Agent & Wallet (core identity)
Goal: run a Veramo agent that can create DIDs and sign messages; connect a frontend wallet to it.
Server tasks


Install Veramo packages:
npm init -y
npm i @veramo/core @veramo/identity-w3c @veramo/did-manager @veramo/kms local-kms @veramo/data-store level



Create server/src/agent.ts — configure Veramo agent with:


KeyManager (local)


DIDManager (did:ethr + did:key for quick wallets)


DataStore plugin (level or in-memory for dev)


DID resolver (ethr-resolver)




Expose simple REST endpoints:


POST /did/create → returns created DID


POST /auth/sign → sign payload with DID key


GET /did/:did → resolve DID doc




Frontend tasks


Create client React app.


Wallet page: “Create Identity” button → calls /did/create, shows DID, pubkey, QR for DID.


Save DID locally (localStorage for MVP; later use IndexedDB or secure store).


Acceptance check


Clicking “Create Identity” produces a DID and shows it in the UI. You can resolve that DID via GET /did/:did.



Phase 2 — VC Issuance (issuer service) & Holder flow
Goal: issuer can issue a VC to a holder DID; holder can store VC locally and display it.
Server / Issuer tasks


Extend server with Issuer agent (can be same Veramo agent or separate agent with issuer DID).


Endpoint POST /issue that:


Accepts { holderDid, credentialSubject }


Creates a VC (W3C format) and signs it with issuer DID


Returns VC JSON (and optionally a hash)




Use Veramo’s createVerifiableCredential API or digitalbazaar primitives.


Holder tasks


UI: “Receive Credential” screen to paste VC JSON or scan QR.


Store credential locally (localStorage/IndexedDB; encrypt at rest in later iterations).


UI: list of stored credentials with details.


Acceptance check


Issuer issues a VC and holder UI shows it. VC validates cryptographically (verify signature locally).



Phase 3 — Verifier flow (presentation + verification)
Goal: verifier can request proof and verify the presented credential.
Server tasks


Implement POST /verify that:


Accepts VC or presentation JSON


Uses Veramo/digitalbazaar to verify signature and optional status (revocation)


Returns verification result { valid: true|false, errors: [...] }




Frontend tasks (Verifier)


“Verify Credential” page: upload VC JSON or scan QR → call /verify → show result.


Optional: implement presentation request flow:


Verifier creates a request (fields needed)


Holder constructs a presentation (optionally selective) and sends back


Acceptance check


Verifier UI shows “✅ Verified” for valid credentials and appropriate error for invalid ones.



Phase 4 — Blockchain anchoring (DID registry & VC anchoring)
Goal: anchor DID and VC hashes on chain (immutable proof + revocation wiring).
Smart contract (solidity) — CredentialRegistry.sol (simple example)
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract CredentialRegistry {
  mapping(bytes32 => bool) public revoked;
  mapping(bytes32 => address) public issuerOf;

  event Anchored(bytes32 indexed vcHash, address indexed issuer);
  event Revoked(bytes32 indexed vcHash, address indexed issuer);

  function anchor(bytes32 vcHash) external {
    issuerOf[vcHash] = msg.sender;
    emit Anchored(vcHash, msg.sender);
  }

  function revoke(bytes32 vcHash) external {
    require(issuerOf[vcHash] == msg.sender, "not issuer");
    revoked[vcHash] = true;
    emit Revoked(vcHash, msg.sender);
  }

  function isRevoked(bytes32 vcHash) external view returns(bool) {
    return revoked[vcHash];
  }
}

Server tasks


Add Hardhat, deploy contract to testnet (or local Hardhat chain).


When issuing VC, compute vcHash = keccak256(JSON.stringify(vc)), call anchor(vcHash) from issuer wallet.


For revoke: call revoke(vcHash).


Frontend tasks


Issuer dashboard: “Anchor credential” button triggers on-chain tx.


Verifier: when verifying, server queries isRevoked(vcHash) and checks result.


Acceptance check


Issuer can anchor vcHash on chain; verifier reads on-chain revocation status and acts accordingly.



Phase 5 — IPFS integration (document anchoring)
Goal: store large documents off-chain and include IPFS CID in VC metadata.
Server tasks


Use ipfs-http-client or Web3.Storage for quick API.


When issuing VC that references a document:


Upload document to IPFS → get CID


Include credentialSubject.documentCid = "<CID>" in VC


Optionally anchor CID / VC hash on chain




Frontend tasks


When user uploads proof (PDF/scan), call server to upload to IPFS and include CID.


Acceptance check


Document is available via ipfs.io/ipfs/<CID> and CID appears in VC. Verifier can fetch the CID to view original doc.



Phase 6 — Selective disclosure (presentations & privacy)
Goal: allow holder to share only requested attributes, not the whole VC.
Options


Use Veramo presentations (presentation generation with selected fields).


For stronger privacy, integrate BBS+ or SD-JWT / ZKP libraries (stretch).


Implementation (MVP)


Build UI where verifier requests name + degree only.


Holder selects fields and generates a presentation JSON containing only those fields + proof signature.


Verifier runs verification on the presentation (Veramo supports presentation verification).


Acceptance check


Holder can generate a presentation that omits sensitive fields and verifier successfully verifies the attributes presented.



Phase 7 — Revocation & update mechanism
Goal: issuers can revoke or update credentials and verifiers can detect revoked ones.
Implementation options


On-chain revocation (contract mapping as above) — simple and transparent.


Status lists (Aries pattern) — large bitmaps / status lists stored on IPFS + referenced in VC metadata.


Server tasks


Add “Revoke” button in Issuer dashboard: call smart contract revoke(vcHash).


When verifying, check isRevoked(vcHash).


UI tasks


Issuer: list issued VCs + revoke action.


Verifier: show revocation status when verifying.


Acceptance check


Revoke operation sets on-chain flag; subsequent verify calls detect revocation and show invalid.



Phase 8 — Polish, tests, CI, and demo prep
Polish


Improve UI: credential cards, history, easy share (QR + deep link).


Add user onboarding: create DID → backup phrase (or export key).


Tests


Unit tests for server endpoints (jest/mocha).


Integration tests for VC issuance → anchor → verify flow.


Smart contract tests (Hardhat).


CI


GitHub Actions for:


Linting (ESLint)


Tests


Hardhat contract test & coverage


Build & deploy (optional)




Demo script (hackathon)


Create wallet (frontend) → show DID.


Issuer issues VC via Issuer UI → anchor on chain.


Holder receives VC → display.


Verifier verifies VC (shows green).


Issuer revokes VC → Verifier now shows revoked.


Show IPFS doc retrieval + selective disclosure demo.


Acceptance check


Demo script runs end-to-end without manual steps beyond UI clicks.



Phase 9 — Stretch goals (if time)


Add DID key recovery / social recovery or passkeys (WebAuthn).


Add mobile app (React Native) using same Veramo agent config.


Add DIDComm messaging for direct agent-to-agent credential exchange.


Implement BBS+ / ZK proof for attribute-level zero-knowledge proofs.


Integrate CREDEBL modules if you want more enterprise features.



Files / code snippets to create right now (copy/paste to start)


server/src/agent.ts — Veramo config skeleton (KMS, DIDManager).


client/src/pages/Wallet.tsx — React page for creating DID + listing credentials.


smart-contracts/contracts/CredentialRegistry.sol — solidity file above.


server/src/issuer.ts — POST /issue implementation using Veramo.


server/src/ipfs.ts — small helper to upload to IPFS via Web3.Storage.



Quick development checklist (tick as you go)


 Repo scaffolded (client/server/contracts)


 Veramo agent runs and creates DID


 Issuer can sign and issue VC


 Holder can receive and store VC


 Verifier can verify VC signature


 Smart contract deployed; anchoring works


 IPFS upload working; CID in VC


 Revocation flow implemented & detected


 Presentation/Selective disclosure implemented


 Demo script validated end-to-end


 Tests & CI enabled



Demo talking points (2–3 lines each)


“Users control their DID and private keys locally — no central database.”


“Credentials are signed by issuers and anchored on chain for tamper-proof verification.”


“Large documents are stored on IPFS; verifiers check on-chain and CID for authenticity.”


“Selective disclosure lets users share only what’s required — privacy first.”


“Issuers can revoke credentials on-chain and verifiers see revocations in real time.”



If you want, I can immediately scaffold the project files listed above (agent skeleton, minimal React wallet page, and the Solidity contract) and paste the code here so you can copy it into your repo. Which file would you like me to generate first?
