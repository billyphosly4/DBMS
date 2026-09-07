const path = require('node:path');
const fs = require('node:fs');
const express = require('express');

const app = express();
const port = process.env.PORT || 3000;
const ordersCollection = 'orders';
const auditCollection = 'adminAudit';
let firestore = null;
let firestoreError = null;
let firebaseAuth = null;

// The server is the secure intermediary: browser code never receives service-account
// credentials and can only access the narrow API routes defined below.
try {
  const admin = require('firebase-admin');
  // Vercel setup: add FIREBASE_SERVICE_ACCOUNT as a server-only JSON environment variable.
  // Local setup: set GOOGLE_APPLICATION_CREDENTIALS or keep serviceAccountKey.json beside server.js.
  const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(__dirname, 'serviceAccountKey.json');
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
    ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
    : fs.existsSync(keyPath) ? JSON.parse(fs.readFileSync(keyPath, 'utf8')) : null;
  if (serviceAccount) {
    const firebaseApp = admin.apps.length ? admin.app() : admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    firestore = firebaseApp ? admin.firestore() : null;
    firebaseAuth = firebaseApp ? admin.auth() : null;
  } else {
    firestoreError = 'Firestore credentials are not configured.';
  }
} catch (error) {
  firestoreError = error.message;
  console.error(`Firestore initialization failed: ${firestoreError}`);
}

app.use(express.json({ limit: '20kb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (request, response) => response.sendFile(path.join(__dirname, 'public', 'index.html')));

async function requireAdmin(request, response, next) {
  const header = request.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token || !firebaseAuth) {
    return response.status(401).json({ error: 'Administrator authentication is required.' });
  }
  try {
    request.user = await firebaseAuth.verifyIdToken(token);
    return next();
  } catch (error) {
    return response.status(401).json({ error: 'Administrator session is invalid or expired.' });
  }
}

async function recordAudit(action, orderId, user, metadata = {}) {
  await firestore.collection(auditCollection).add({ action, orderId, actorEmail: user.email || 'unknown', createdAt: new Date(), ...metadata });
}

app.get('/api/activity', requireAdmin, async (request, response) => {
  if (!firestore) {
    return response.status(503).json({ error: firestoreError || 'Firestore is unavailable.' });
  }
  try {
    const snapshot = await firestore.collection(auditCollection).orderBy('createdAt', 'desc').limit(12).get();
    return response.json({ activity: snapshot.docs.map((document) => ({ id: document.id, ...document.data() })) });
  } catch (error) {
    console.error('GET /api/activity failed:', error.message);
    return response.status(500).json({ error: 'Unable to fetch audit activity.' });
  }
});

app.get('/api/orders', requireAdmin, async (request, response) => {
  if (!firestore) {
    return response.status(503).json({ error: firestoreError || 'Firestore is unavailable.' });
  }
  try {
    const snapshot = await firestore.collection(ordersCollection).orderBy('createdAt', 'desc').limit(25).get();
    return response.json({ source: 'firestore', orders: snapshot.docs.map((document) => ({ id: document.id, ...document.data() })) });
  } catch (error) {
    console.error('GET /api/orders failed:', error.message);
    return response.status(500).json({ error: 'Unable to fetch orders.' });
  }
});

app.delete('/api/orders/:id', requireAdmin, async (request, response) => {
  if (!firestore) {
    return response.status(503).json({ error: firestoreError || 'Firestore is unavailable.' });
  }
  try {
    await firestore.collection(ordersCollection).doc(request.params.id).delete();
    await recordAudit('deleted', request.params.id, request.user);
    return response.status(204).end();
  } catch (error) {
    console.error('DELETE /api/orders/:id failed:', error.message);
    return response.status(500).json({ error: 'Unable to delete order.' });
  }
});

app.patch('/api/orders/:id', requireAdmin, async (request, response) => {
  if (!firestore) {
    return response.status(503).json({ error: firestoreError || 'Firestore is unavailable.' });
  }
  const allowedStatuses = ['Pending', 'Processing', 'Shipped', 'Delivered'];
  const { status } = request.body || {};
  if (!allowedStatuses.includes(status)) {
    return response.status(400).json({ error: 'Unsupported order status.' });
  }
  try {
    const reference = firestore.collection(ordersCollection).doc(request.params.id);
    await reference.update({ status, updatedAt: new Date() });
    await recordAudit('status_changed', request.params.id, request.user, { status });
    return response.json({ id: request.params.id, status });
  } catch (error) {
    console.error('PATCH /api/orders/:id failed:', error.message);
    return response.status(500).json({ error: 'Unable to update order status.' });
  }
});

app.post('/api/orders', requireAdmin, async (request, response) => {
  if (!firestore) {
    return response.status(503).json({ error: firestoreError || 'Firestore is unavailable.' });
  }
  const { customer, item, price, status = 'Pending' } = request.body || {};
  if (!customer || !item || !Number.isFinite(Number(price)) || Number(price) <= 0) {
    return response.status(400).json({ error: 'customer, item, and a positive price are required.' });
  }
  const order = { customer: String(customer).trim(), item: String(item).trim(), price: Number(price), status, createdAt: new Date() };
  try {
    const document = await firestore.collection(ordersCollection).add(order);
    await recordAudit('created', document.id, request.user, { status: order.status });
    return response.status(201).json({ id: document.id, ...order });
  } catch (error) {
    console.error('POST /api/orders failed:', error.message);
    return response.status(500).json({ error: 'Unable to create order.' });
  }
});

if (require.main === module) {
  app.listen(port, () => console.log(`Northstar dashboard running at http://localhost:${port}`));
}

module.exports = app;
