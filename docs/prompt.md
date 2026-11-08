prompt 2
Proceed and build the full core application now.

Must include:
1. School Admin dashboard
   - Create new invoice form
   - List of all invoices with status
   - Copy payment link button
   - CSV export button

2. Public payment page (the link the parent receives)
   - Clear invoice details
   - Amount and due date
   - Pay with USDC button
   - Status feedback after payment

3. Working end-to-end flow on testnet:
   Create invoice → get payment link → pay with USDC → status updates to Paid → appear in admin dashboard and CSV

Strict rules:
- Absolutely no “Built with Arc Studio”, Circle, or Arc branding, floating buttons, badges, or watermarks anywhere in the UI.
- Clean professional design only.
- No seed phrases or complex wallet UX if avoidable.

After the core happy path works, show me:
- The admin dashboard
- The public payment page
- Confirmation that a test payment updates status correctly


prompt 3
Add proper multi-school support and design the smart contract carefully.

Context:
- Final target chain is NEAR (testnet first, then mainnet).
- We are using Arc Studio now for fast prototyping of the UI and payment logic.
- Therefore the contract must be structured so the same business logic is easy to re-implement later as a NEAR smart contract.

### Multi-School Requirements

1. School Registration
   - Anyone can register a new school (or we can restrict it later).
   - When registering, collect:
     - School name
     - School admin address / wallet
     - Optional short description or location
   - Each school gets a unique schoolId

2. School ownership & access control
   - Only the registered school admin can create invoices for that school
   - Only the school admin can view the full list of invoices and export CSV for their school
   - Parents only see the specific invoice they are paying

3. Invoices belong to a school
   - Every invoice must be linked to a schoolId
   - Payment page should still work with a simple public link (no need for the parent to know the schoolId)

4. Admin experience
   - After connecting wallet, the admin should see only their own school’s invoices
   - Clear “Create Invoice” flow that is already scoped to their school

### Contract Structure Instructions (Very Important)

Design the contract with clean, portable logic so we can later rewrite it for NEAR:

Recommended structure:

- Schools mapping / table:
  - schoolId → { name, admin, createdAt, isActive }

- Invoices mapping / table:
  - invoiceId → {
      schoolId,
      studentName,
      studentId (optional),
      term,
      amount,
      dueDate,
      status (Pending / Paid / Refunded),
      payer (optional),
      paidAt,
      paymentTxHash or reference
    }

- Core functions (keep them simple and clear):
  - registerSchool(name) → returns schoolId
  - createInvoice(schoolId, studentName, term, amount, dueDate, ...) → returns invoiceId
  - getInvoice(invoiceId)
  - getSchoolInvoices(schoolId)
  - markAsPaid(invoiceId, paymentReference)  (or have payment automatically update status)
  - Only school admin can call createInvoice and view full school data

Design principles for portability to NEAR:
- Prefer simple state and clear functions over complex inheritance
- Use events / logs for important actions (SchoolRegistered, InvoiceCreated, InvoicePaid)
- Keep access control explicit (msg.sender / predecessor checks)
- Avoid heavy use of EVM-specific patterns that would be hard to translate
- Comment the contract clearly so a developer can later rewrite the same logic in a NEAR contract (Rust or AssemblyScript)

### UI Requirements for Multi-School

- Registration page or modal for new schools
- After registration, the admin lands on their school dashboard
- Dashboard only shows invoices belonging to their school
- Payment links remain simple public URLs

### Strict Rules

- Do NOT add any “Built with Arc Studio”, Circle, or Arc branding, floating buttons, badges, or watermarks.
- Keep the UI clean and professional (school admin software style).
- Prefer clarity and simplicity over cleverness in the contract.

First outline:
1. The updated data model (Schools + Invoices)
2. The main contract functions
3. How access control will work
4. How the frontend will handle school registration and scoping

Then wait for my approval before implementing the changes.

prompt 4
Audit the entire frontend for any Arc Studio, Circle, or third-party branding.

Remove:
- Any floating “Built with Arc Studio” button
- Any Circle or Arc logos
- Any watermarks
- Any promotional text or badges
- Any footer that mentions Arc Studio or Circle

Make the UI look like a normal school fee management tool. Keep it clean, professional, and free of any builder branding.

Also improve:
- Mobile responsiveness
- Loading and success states
- Error messages in plain language

prompt 5
Strengthen the payment and accounting side:

1. After a successful payment, clearly show:
   - Status = Paid
   - Transaction reference / hash
   - Timestamp

2. In the School Admin dashboard:
   - Make status filters easy (All / Pending / Paid)
   - Show transaction reference for paid invoices

3. CSV export must contain at least:
   - Invoice ID
   - Student name / ID
   - Term
   - Amount
   - Status
   - Payment timestamp
   - Transaction hash / reference

Make the CSV clean enough that a school bursar can open it and understand everything without asking questions.

prompt 6
Write a clear README.md suitable for the NEAR Hackathon judges (including AI judges).

Structure it like this:

# School Fee Payment Tracker

## Problem
Short description of the real problem schools and parents face with fee collection.

## Solution
What this app does in plain language.

## How it works
Numbered steps a judge can follow:
1. Do X → see Y
2. Do X → see Y
etc.

## Tech stack
List what was used.

## How to run / try the demo
Clear instructions.

## Notes for judges
- Built primarily with Arc Studio for rapid prototyping of the USDC payment flow.
- No Arc Studio or Circle branding appears in the UI.
- Designed as a practical real-world money tool (payments + tracking + export).
- Contract logic was structured to be portable to NEAR later.

Keep the language factual and free of marketing hype. Focus on “do X, see Y” steps.

prompt 7
Prepare the project for export:

1. Make sure the code is clean and well organized.
2. Confirm again that no Arc Studio / Circle branding exists in the UI or in any generated comments that would appear to users.
3. make sure that the build align with my contract already deployed 
my feed back

I want the outline for a REAL multi-school architecture, not the cheaper demo.

The goal is to build a School Fee Registry that can serve multiple independent schools.

Before writing any code, provide a detailed technical outline covering:

1. How schools will be registered on the contract.
2. How each school will have its own administrator and treasury wallet.
3. How each school will create, manage and cancel its own invoices.
4. How payments will be routed to the correct school's treasury.
5. How platform fees will be collected.
6. How to prevent one school from accessing or modifying another school's data.
7. How refunds and payment settlements will work.
8. The required changes to the smart contract, backend, database and dashboard.
9. Security risks and how they will be handled.
10. Test cases required before deployment.

Important:

- The existing deployed contract must remain untouched.
- Propose a new contract version for multi-school support.
- Preserve the existing payment security and refund mechanisms where appropriate.
- Explain the implications for the existing USDC integration.
- Identify any changes needed to the current application architecture.

Do not implement anything yet. Give me the outline, explain the trade-offs, and wait for my approval.