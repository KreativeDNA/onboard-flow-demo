Below is a single-file Node/Express server designed for demo purposes. It uses environment variables (see `.env.example`) and includes detailed comments.

// server.js
// Onboard Flow Demo - single file demo server

require('dotenv').config();
const express = require('express');
const Stripe = require('stripe');
const docusign = require('docusign-esign');
const fetch = require('node-fetch'); // used for monday.com GraphQL
const algoliasearch = require('algoliasearch');
const Database = require('better-sqlite3');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;

// Env / config
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder');
const DOCUSIGN_BASE_PATH = process.env.DOCUSIGN_BASE_PATH || 'https://demo.docusign.net/restapi';
const DOCUSIGN_ACCOUNT_ID = process.env.DOCUSIGN_ACCOUNT_ID || '';
const DOCUSIGN_ACCESS_TOKEN = process.env.DOCUSIGN_ACCESS_TOKEN || '';
const DOCUSIGN_TEMPLATE_ID = process.env.DOCUSIGN_TEMPLATE_ID || '';

const ALGOLIA_APP_ID = process.env.ALGOLIA_APP_ID || '';
const ALGOLIA_ADMIN_KEY = process.env.ALGOLIA_ADMIN_KEY || '';
const ALGOLIA_INDEX_NAME = process.env.ALGOLIA_INDEX_NAME || 'onboard_demo';

const MONDAY_API_KEY = process.env.MONDAY_API_KEY || '';
const MONDAY_BOARD_ID = process.env.MONDAY_BOARD_ID || '';

const ZAPIER_WEBHOOK_URL = process.env.ZAPIER_WEBHOOK_URL || '';

// SQLite setup -- simple demo DB (file defined in .env)
const DB_FILE = process.env.SQLITE_FILE || './data/demo.db';
const db = new Database(DB_FILE);

// Create table if not exists
db.prepare(`CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  name TEXT,
  email TEXT,
  product TEXT,
  price REAL,
  paymentId TEXT,
  paymentStatus TEXT,
  envelopeId TEXT,
  envelopeStatus TEXT,
  createdAt TEXT
)`).run();

// Simple Algolia client
let algoliaClient = null;
let algoliaIndex = null;
if (ALGOLIA_APP_ID && ALGOLIA_ADMIN_KEY) {
  algoliaClient = algoliasearch(ALGOLIA_APP_ID, ALGOLIA_ADMIN_KEY);
  algoliaIndex = algoliaClient.initIndex(ALGOLIA_INDEX_NAME);
}

// Basic middleware
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Simple validation
function validateOrder(data) {
  const { name, email, product, price } = data || {};
  if (!name || !email || !product || !price) return 'All fields are required.';
  if (isNaN(price)) return 'Price must be a number.';
  return null;
}

// Helper: save order to DB
function saveOrderRecord(record) {
  const stmt = db.prepare(`INSERT INTO orders (id,name,email,product,price,paymentId,paymentStatus,envelopeId,envelopeStatus,createdAt)
    VALUES (@id,@name,@email,@product,@price,@paymentId,@paymentStatus,@envelopeId,@envelopeStatus,@createdAt)`);
  stmt.run(record);
}

// POST /orders - main orchestration endpoint
app.post('/orders', async (req, res) => {
  const validationError = validateOrder(req.body);
  if (validationError) return res.status(400).json({ error: validationError });

  const { name, email, product, price } = req.body;
  const orderId = Date.now().toString();

  try {
    // 1) Create PaymentIntent in Stripe
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(price * 100), // cents
      currency: 'usd',
      receipt_email: email,
      description: `Order ${orderId} - ${product}`,
      metadata: { orderId, product, name },
    });
    console.log('Stripe PaymentIntent created:', paymentIntent.id);

    // At this point in a real app you might return the client_secret to the frontend
    // and confirm the payment there. For demo we proceed as if payment is complete.

    // 2) Create DocuSign envelope (using template)
    let envelopeId = null;
    if (DOCUSIGN_ACCESS_TOKEN && DOCUSIGN_TEMPLATE_ID && DOCUSIGN_ACCOUNT_ID) {
      const envelopesApi = new docusign.EnvelopesApi();
      const apiClient = new docusign.ApiClient();
      apiClient.setBasePath(DOCUSIGN_BASE_PATH);
      apiClient.addDefaultHeader('Authorization', 'Bearer ' + DOCUSIGN_ACCESS_TOKEN);
      envelopesApi.apiClient = apiClient;

      const envelopeDefinition = new docusign.EnvelopeDefinition();
      envelopeDefinition.emailSubject = `Please sign your contract for ${product}`;
      envelopeDefinition.templateId = DOCUSIGN_TEMPLATE_ID;
      envelopeDefinition.templateRoles = [{
        email,
        name,
        roleName: 'Signer', // match the role name in your template
      }];
      envelopeDefinition.status = 'sent';

      const envRes = await envelopesApi.createEnvelope(DOCUSIGN_ACCOUNT_ID, { envelopeDefinition });
      envelopeId = envRes.envelopeId;
      console.log('DocuSign envelope created:', envelopeId);
    } else {
      console.warn('DocuSign not configured; skipping envelope creation.');
    }

    // 3) Create a monday.com item (simple GraphQL example)
    if (MONDAY_API_KEY && MONDAY_BOARD_ID) {
      const query = `mutation ($boardId: Int!, $itemName: String!) { create_item (board_id: $boardId, item_name: $itemName) { id } }`;
      const variables = { boardId: parseInt(MONDAY_BOARD_ID, 10), itemName: `${name} — ${product}` };
      await fetch('https://api.monday.com/v2', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': MONDAY_API_KEY,
        },
        body: JSON.stringify({ query, variables }),
      }).then(r => r.json()).then(j => console.log('monday.com response', j)).catch(e => console.warn('monday.com error', e));
    }

    // 4) Index in Algolia
    if (algoliaIndex) {
      await algoliaIndex.saveObject({
        objectID: orderId,
        name,
        email,
        product,
        price,
        paymentId: paymentIntent.id,
        envelopeId,
        createdAt: new Date().toISOString(),
      });
      console.log('Indexed order in Algolia', orderId);
    }

    // 5) Optionally trigger Zapier
    if (ZAPIER_WEBHOOK_URL) {
      fetch(ZAPIER_WEBHOOK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId, name, email, product, price }) })
        .then(() => console.log('Zapier called'))
        .catch(() => console.warn('Zapier call failed'));
    }

    // 6) Persist order in SQLite for demo
    const record = {
      id: orderId,
      name,
      email,
      product,
      price: Number(price),
      paymentId: paymentIntent.id,
      paymentStatus: paymentIntent.status,
      envelopeId: envelopeId || null,
      envelopeStatus: envelopeId ? 'sent' : null,
      createdAt: new Date().toISOString(),
    };
    saveOrderRecord(record);

    // 7) Respond
    res.status(200).json({ message: 'Order processed', orderId, paymentId: paymentIntent.id, envelopeId });

  } catch (err) {
    console.error('Error in /orders', err);
    res.status(500).json({ error: 'Order processing failed', details: err.message });
  }
});

// Stripe webhook receiver (recommended to verify using stripe's signing secret)
app.post('/webhook/stripe', bodyParser.raw({ type: 'application/json' }), (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  let event;
  try {
    if (webhookSecret) {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } else {
      event = JSON.parse(req.body.toString());
    }
  } catch (err) {
    console.warn('Stripe webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log('Stripe webhook received:', event.type);
  // handle event types
  if (event.type === 'payment_intent.succeeded') {
    const pi = event.data.object;
    console.log('Payment succeeded for:', pi.id);
    // Update DB/payment status if needed
  }

  res.json({ received: true });
});

// DocuSign webhook endpoint
app.post('/webhook/docusign', (req, res) => {
  console.log('DocuSign webhook received:', JSON.stringify(req.body));
  // DocuSign sends XML by default for Connect; ensure you configure JSON or parse XML.
  res.status(200).send('OK');
});

// Basic list endpoint for demo viewing
app.get('/orders', (req, res) => {
  const rows = db.prepare('SELECT * FROM orders ORDER BY createdAt DESC LIMIT 100').all();
  res.json(rows);
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));


