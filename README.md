# onboard-flow-demo
Demo API integration project using Stripe, DocuSign, monday.com, Algolia, and Zapier
**End-to-end demo:** Customer order → Stripe (payment) → DocuSign (e-sign) → monday.com (task managment) → Algolia (search index) Zapier (notifications).

This repository includes:

- `server.js` — Node.js/Express backend that orchestrates the flow
- `package.json` (instructions below for creation)
- `.env.example` — environment variable list
- Postman collection (instructions to create/import)

---

## What this demo does

1. Receives an order at `POST /orders`.
2. Creates a Stripe PaymentIntent (test mode).
3. Creates a DocuSign envelope (from a template) and sends it for signature.
4. Creates a monday.com item for the order (placeholder GraphQL example).
5. Indexes the order/customer in Algolia (for fast search).
6. Exposes webhook endpoints for Stripe (`/webhook/stripe`) and DocuSign (`/webhook/docusign`).
7. Persists records in a small SQLite database for demo persistence.

---

## Prerequisites

- Node.js 18+ and npm
- Git (for pushing to GitHub)
- Stripe developer account (test keys)
- DocuSign developer account (integration key + template)
- Algolia account (Application ID & Admin API Key)
- monday.com account and API token (optional for full integration)
- ngrok or localtunnel (for exposing webhooks)

---

## Files included

- `server.js` — main server (contains detailed comments)
- `.env.example` — environment variables used by the app (below)

---

## .env.example

```

# Stripe

STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx

# DocuSign

DOCUSIGN_BASE_PATH=[https://demo.docusign.net/restapi](https://demo.docusign.net/restapi)
DOCUSIGN_ACCOUNT_ID=your-docusign-api-account-id
DOCUSIGN_INTEGRATION_KEY=your-integration-key
DOCUSIGN_SECRET=your-docusign-secret
DOCUSIGN_TEMPLATE_ID=your-template-id
DOCUSIGN_ACCESS_TOKEN=your-temp-access-token

# monday.com (optional)

MONDAY_API_KEY=your_monday_api_key
MONDAY_BOARD_ID=your_board_id

# Algolia

ALGOLIA_APP_ID=YourAlgoliaAppID
ALGOLIA_ADMIN_KEY=YourAlgoliaAdminKey
ALGOLIA_INDEX_NAME=onboard_demo

# Zapier (optional)

ZAPIER_WEBHOOK_URL=[https://hooks.zapier.com/hooks/catch/](https://hooks.zapier.com/hooks/catch/)...

# Local server

PORT=3000

# SQLite file (relative path)

SQLITE_FILE=./data/demo.db

````

---

## Setup steps (local)

1. Clone repo (or create a new one locally):

```bash
mkdir onboard-flow-demo
cd onboard-flow-demo
git init
````

2. Create `package.json` and install dependencies:

```bash
npm init -y
npm install express stripe docusign-esign sqlite3 better-sqlite3 algoliasearch node-fetch dotenv
```

> Note: `node-fetch` is used for monday.com GraphQL examples. `better-sqlite3` is used for simplicity (synchronous small-db usage in demo). If you prefer, switch to `sqlite3`.

3. Create `.env` from `.env.example` and fill your keys.

4. Start the server:

```bash
node server.js
```

5. Use `ngrok` or `localtunnel` to expose your webhook endpoint for DocuSign & Stripe (these require public HTTPS endpoints):

```bash
ngrok http 3000
# or
npx localtunnel --port 3000 --subdomain onboard-demo
```

6. Configure DocuSign Connect to point to `https://YOUR_NGROK_URL/webhook/docusign` and enable `Envelope Completed` events.

7. Configure Stripe Dashboard webhook endpoint to `https://YOUR_NGROK_URL/webhook/stripe` (and copy the `STRIPE_WEBHOOK_SECRET` into your `.env`).

---

## Postman / Testing

* Import a Postman collection (you can create a collection with these requests):

  * `POST /orders` — JSON body: `{ name, email, product, price }`
  * `POST /webhook/docusign` — sample payload for testing webhook receiver
  * `POST /webhook/stripe` — sample stripe event payload (or use Stripe CLI)

**Stripe CLI** can be handy to replay webhooks locally:

```bash
stripe login
stripe listen --forward-to localhost:3000/webhook/stripe
```

---

## GitHub & LinkedIn Tips

* Create a repo `onboard-flow-demo` and push your files.
* Include screenshots of Postman request/response, DocuSign envelope list, and Algolia search results in README.
* LinkedIn caption suggestion:

> Built an end-to-end onboarding automation integrating Stripe, DocuSign, monday.com, Algolia, and Zapier. Practiced API authentication, webhook handling, and search indexing. Repo & demo: <link>

---

## Troubleshooting

* If DocuSign webhooks don’t reach local server, check ngrok URL and Connect configuration.
* If you see `Invalid API Key` from Stripe, confirm you’re using `sk_test_...` (secret key) not `pk_test_...` (publishable).
* DocuSign access tokens expire — for local testing use the API Explorer to generate a temp token or implement OAuth.

---
