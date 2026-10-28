# CSJ Portal

A Next.js portal on top of the **CSJ** NocoDB base. Staff use it for Verifications, Authorizations with follow-ups, Procedure Coordination and Patients. Admins also manage users and the Procedures and Insurances catalogs.
See **REQUIREMENTS.md** for the functional scope.

## Deploy on Railway

1. Push this folder to a GitHub repo (private). Or use the Railway CLI from this folder: `railway up`.
2. In Railway, choose **New Project → Deploy from GitHub repo** and pick the repo. `railway.json` sets the build and start commands and the health check.
3. In the service's **Variables** tab, add:

   | Variable | Value |
   |---|---|
   | `NOCODB_URL` | `https://your-nocodb-domain` (no trailing slash) |
   | `NOCODB_TOKEN` | Your NocoDB API token |
   | `NOCODB_BASE_ID` | `pfchnhvc1sa838q` |
   | `SESSION_SECRET` | A long random string: `openssl rand -base64 48` |
   | `BOOTSTRAP_ADMIN_EMAIL` | Your email |
   | `BOOTSTRAP_ADMIN_PASSWORD` | A strong password (10+ characters, letters and numbers) |
   | `BOOTSTRAP_ADMIN_NAME` | Your name |
   | `APP_TIMEZONE` | `America/Detroit` (optional) |

4. Go to **Settings → Networking → Generate Domain**, or add your own domain.
5. Open the URL and sign in with the bootstrap email and password. On this first login the portal:
   - creates the **Portal Users** table in NocoDB
   - creates you as Admin
6. Go to **Admin → Setup** and check that every table, field and link shows **OK**.
7. Go to **Admin → Users** and create your team's accounts.

> After the first admin exists, the `BOOTSTRAP_*` variables are ignored. You can remove them.
> In NocoDB, consider hiding the **Password Hash** column of Portal Users. It only contains bcrypt hashes.

## Local development

```bash
npm install
cp .env.example .env.local   # fill in values
npm run dev                  # http://localhost:3000
```

To try the portal without touching real data, use the included NocoDB mock:

```bash
npm run mock:nocodb          # http://localhost:8090, token "dev-token", base "pmockbase"
# .env.local:
# NOCODB_URL=http://localhost:8090
# NOCODB_TOKEN=dev-token
# NOCODB_BASE_ID=pmockbase
```

## Changing fields or modules

Each module is defined in `lib/modules.ts`: columns, which fields can be edited inline, the form, parents (links) and related lists. Field names must match the NocoDB field titles.

Dropdown options are **not** set in the code. They are read from NocoDB. To add an option, add it to the single select in NocoDB, then use **Admin → Setup → Reload schema from NocoDB**.

## Structure

```
app/(portal)/...       pages (dashboard, module pages, admin)
app/api/...            server API (auth, records, related lists, users, setup, health)
components/...         UI (grid with inline editing, forms, drawer, pickers)
lib/nocodb.ts          NocoDB client (token stays on the server)
lib/schema.ts          live schema discovery (fields, select options, link fields)
lib/records.ts         list / create / update / links with server-side validation
lib/modules.ts         module definitions
dev/mock-nocodb.mjs    local NocoDB mock for testing
```

## Troubleshooting

- **"Cannot reach NocoDB"**: check `NOCODB_URL`, `NOCODB_TOKEN` and `NOCODB_BASE_ID`. Also check that the Railway service can reach your NocoDB server, for example that a firewall isn't blocking it.
- **Setup shows a link as "Missing"**: the n8n step that creates link fields didn't run. Create the link in NocoDB with the same name shown in `lib/modules.ts` (for example a *Links* field "Follow-ups" on Authorizations, type has-many to Auth Follow-ups), then reload the schema.
- **Procedure or Insurance picker is empty**: the n8n "Insert Catalog Records" step didn't run. Add the records in Admin → Procedures / Insurances.
