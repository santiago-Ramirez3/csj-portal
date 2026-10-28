# CSJ Portal — Requirements (v1)

## 1. Goal
One web portal where the CSJ team creates and updates verifications, authorizations (with follow-ups) and procedure coordination, on top of the **CSJ base in NocoDB**. It replaces day-to-day work in the Google Sheets, and NocoDB stays the database.

## 2. Users and roles
| Role | Can do |
|---|---|
| **Staff** | Sign in. See dashboard, Verifications, Authorizations, Procedure Coordination, Patients. Create records and edit them (forms and inline status edits), add follow-ups, export CSV. Can read the Procedures/Insurances catalogs (dropdowns) but not edit them. |
| **Admin** | Everything Staff can do, plus: manage users (create, change role, deactivate, reset password), edit the Procedures and Insurances catalogs, delete records, open the Setup check. |

- Each user has their own login (email + password). Passwords are stored as bcrypt hashes in the NocoDB table **Portal Users**, which the portal creates on first run.
- The first admin comes from environment variables and is created only while Portal Users is empty.
- Sessions use an httpOnly signed cookie and expire after `SESSION_HOURS` (default 12).
- A deactivated user loses access within about 60 seconds.
- Login is limited to 10 attempts per IP and email every 15 minutes.

## 3. Modules
### 3.1 Dashboard
- Counters (click one to open the filtered list): Auths pending, Appeals pending, Coordination pending, Unable to proceed, Verifications pending.
- **Procedures in the next 7 days**: Date of Service, patient, procedure, and the Clearance, Auth, Verification, Transportation and Status values.

### 3.2 Verifications (replicates "Verifications CSJ")
- Fields: Patient Name, Date of Birth, Insurance, Verification Status, Referral Obtained, Notes, Date Worked, DOS.
- **Insurance**, **Verification Status** and **Referral Obtained** are single-select dropdowns, read live from NocoDB.
- A patient is required. Name and DOB are copied from the selected patient.
- Filters: text search, status chips, DOS date range.

### 3.3 Authorizations (Hodroj log) + Follow-ups
- All Hodroj columns. Status options: Approved, PA Not Required, Pending, D/S, Denied, Appeal Pending, Appeal Approved, Appeal Denied.
- Linked to a **Patient** (required) and an **Insurance** (searchable payer catalog).
- In the case detail panel, the **Follow-ups** list shows every follow-up of that authorization (date, channel, summary, notes), with **+ Add follow-up**.
- Filters: search (patient, insurance ID, auth/ref #), status chips, date range on Date.

### 3.4 Procedure Coordination (CSJ "Auth Log" sheet)
- **Procedure** is a searchable dropdown from the Procedures catalog.
- Clearance, Auth, Verification, Transportation, Pre-op Info Sent, Procedure Meds, Status and Language are dropdowns with the same options and defaults as the sheet.
- Filters: date range, procedure, status chips. These replace the "Query" tab and the per-day tabs.

### 3.5 Patients
- One record per patient (Name LAST, FIRST, DOB, Preferred Language, Notes).
- The detail panel shows the patient's verifications, authorizations and coordinations.
- Patients can also be created inline from any form (**+ New patient**).

### 3.6 Admin
- **Procedures** and **Insurances** catalogs: create, edit, deactivate. Inactive items still show in the pickers, marked "(inactive)".
- **Users**: described in section 2.
- **Setup check**: shows the tables and fields found, link health, record counts, and has a "Reload schema" button.

## 4. Common behaviour
- **Table view**: sortable columns, 50 rows per page, sticky header. Click a status cell to change it in place (it saves immediately). Click a text or date cell to edit it (saves on Enter or when you leave the cell). Click a row to open the full record panel.
- **Forms**: required fields are marked with *. Defaults come from NocoDB (for example Status = Pending). Errors are shown inline.
- **Export CSV** exports the current filtered list, up to 2,000 rows.
- **Dropdown options** come from NocoDB. To add an option, add it to the single select in NocoDB, then use Admin → Setup → Reload schema.
- Dates are shown as MM/DD/YYYY. "Today" uses `APP_TIMEZONE` (default America/Detroit).
- Works on desktop. On phones, the menu collapses.

## 5. Integration with NocoDB
- The browser never talks to NocoDB. The Next.js server calls NocoDB with the `xc-token`, and the token stays in Railway variables.
- Schema (tables, fields, select options, link fields) is read through the meta API v3, with v2 as a fallback, and cached for 5 minutes.
- Records and links go through the v2 data API.
- The server checks every write: only the fields defined for that module are accepted, select values must be valid options, and dates must be valid. Patient name, DOB and language are copied from the linked patient.
- Links use the has-many fields created by the n8n workflow: Patients → Verifications / Authorizations / Procedure Coordinations, Insurances → Authorizations, Authorizations → Follow-ups, Procedures → Procedure Coordinations.

## 6. Non-functional requirements
- **Hosting**: one Railway service (Node 20+). Health check at `/api/health`.
- **Security**: HTTPS (Railway), httpOnly + secure cookies, security headers, no indexing, role checks on every API route, rate-limited login.
- **PHI / HIPAA**: the portal handles patient names, DOB and insurance IDs. Before go-live, confirm that your hosting (Railway and the NocoDB server) meets your compliance requirements, for example a signed BAA and encryption at rest. Limit portal and NocoDB access to the people who need it.

## 7. Out of scope for v1 (proposed next steps)
- Audit trail: who changed what and when (needs "Updated By" fields or a log table).
- Automations with n8n: reminders for pending auths, expiring auths (Auth Valid To), DOS without clearance.
- Migration of the historical Hodroj log (about 10,470 rows) and the coordination log. Use the Insurances "Aliases" field to match payers.
- File attachments (clinicals, faxes) and SSO.
