const path = require('node:path');
const fs = require('node:fs');
const express = require('express');

const app = express();
const port = process.env.PORT || 3000;
const applicantsCollection = 'agency_applicants';
const auditCollection = 'adminAudit';
const streamClients = new Set();
let firestore = null;
let firebaseAuth = null;
let firestoreError = null;

// The server is the protected intermediary between the browser and Firestore.
// Service-account credentials never leave this process or appear in public/.
try {
  const admin = require('firebase-admin');
  const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(__dirname, 'serviceAccountKey.json');
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
    ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
    : fs.existsSync(keyPath) ? JSON.parse(fs.readFileSync(keyPath, 'utf8')) : null;

  if (serviceAccount) {
    const firebaseApp = admin.apps.length
      ? admin.app()
      : admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    firestore = admin.firestore();
    firebaseAuth = admin.auth();
    void firebaseApp;
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

function serializeApplicant(document) {
  const data = document.data ? document.data() : document;
  return {
    id: document.id || data.id,
    applicantName: data.applicantName || data.customerName || '',
    targetRole: data.targetRole || data.productName || '',
    attachedDocuments: data.attachedDocuments || data.documents || data.files || '',
    talentClassification: data.talentClassification || data.classification || data.tier || '',
    createdAt: data.createdAt || null,
    updatedAt: data.updatedAt || null,
  };
}

async function verifyToken(request) {
  const header = request.headers.authorization || '';
  const bearerToken = header.startsWith('Bearer ') ? header.slice(7) : null;
  const token = bearerToken || request.query.token;
  if (!token || !firebaseAuth) return null;
  try {
    return await firebaseAuth.verifyIdToken(token);
  } catch (error) {
    return null;
  }
}

async function requireAdmin(request, response, next) {
  const user = await verifyToken(request);
  if (!user) return response.status(401).json({ error: 'Administrator authentication is required.' });
  request.user = user;
  return next();
}

async function recordAudit(action, applicantId, user, metadata = {}) {
  if (!firestore) return;
  await firestore.collection(auditCollection).add({
    action,
    applicantId,
    actorEmail: user.email || 'unknown',
    createdAt: new Date(),
    ...metadata,
  });
}

function pushApplicants(event, applicants) {
  const message = `event: ${event}\ndata: ${JSON.stringify({ source: 'firestore', applicants })}\n\n`;
  for (const client of streamClients) client.write(message);
}

function startApplicantStream() {
  if (!firestore) return;
  firestore.collection(applicantsCollection).onSnapshot((snapshot) => {
    const applicants = snapshot.docs
      .map(serializeApplicant)
      .sort((first, second) => (second.createdAt?._seconds || 0) - (first.createdAt?._seconds || 0));
    pushApplicants('applicants', applicants);
  }, (error) => {
    console.error('Firestore applicant stream failed:', error.message);
    pushApplicants('error', []);
  });
}

startApplicantStream();

app.get('/api/applicants', requireAdmin, async (request, response) => {
  if (!firestore) return response.status(503).json({ error: firestoreError || 'Firestore is unavailable.' });
  try {
    const snapshot = await firestore.collection(applicantsCollection).limit(100).get();
    const applicants = snapshot.docs.map(serializeApplicant).sort((first, second) => (second.createdAt?._seconds || 0) - (first.createdAt?._seconds || 0));
    return response.json({ source: 'firestore', applicants });
  } catch (error) {
    console.error('GET /api/applicants failed:', error.message);
    return response.status(500).json({ error: 'Unable to fetch applicant profiles.' });
  }
});

app.get('/api/applicants/stream', async (request, response) => {
  const user = await verifyToken(request);
  if (!user) return response.status(401).end('Administrator authentication is required.');
  if (!firestore) return response.status(503).end(firestoreError || 'Firestore is unavailable.');

  response.setHeader('Content-Type', 'text/event-stream');
  response.setHeader('Cache-Control', 'no-cache, no-transform');
  response.setHeader('Connection', 'keep-alive');
  response.flushHeaders?.();
  response.write(': applicant stream connected\n\n');
  streamClients.add(response);
  request.on('close', () => streamClients.delete(response));
});

app.post('/api/applicants', requireAdmin, async (request, response) => {
  if (!firestore) return response.status(503).json({ error: firestoreError || 'Firestore is unavailable.' });
  const body = request.body || {};
  const applicant = {
    applicantName: String(body.applicantName || body.customerName || '').trim(),
    targetRole: String(body.targetRole || body.productName || '').trim(),
    attachedDocuments: String(body.attachedDocuments || body.documents || body.files || '').trim(),
    talentClassification: String(body.talentClassification || body.tier || body.classification || '').trim(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  if (!applicant.applicantName || !applicant.targetRole || !applicant.attachedDocuments || !applicant.talentClassification) {
    return response.status(400).json({ error: 'Applicant name, target role, documents, and classification are required.' });
  }
  try {
    const document = await firestore.collection(applicantsCollection).add(applicant);
    await recordAudit('applicant_created', document.id, request.user, { applicantName: applicant.applicantName, targetRole: applicant.targetRole });
    return response.status(201).json({ id: document.id, ...applicant });
  } catch (error) {
    console.error('POST /api/applicants failed:', error.message);
    return response.status(500).json({ error: 'Unable to ingest applicant profile.' });
  }
});

app.delete('/api/applicants/:id', requireAdmin, async (request, response) => {
  if (!firestore) return response.status(503).json({ error: firestoreError || 'Firestore is unavailable.' });
  try {
    await firestore.collection(applicantsCollection).doc(request.params.id).delete();
    await recordAudit('applicant_deleted', request.params.id, request.user);
    return response.status(204).end();
  } catch (error) {
    console.error('DELETE /api/applicants/:id failed:', error.message);
    return response.status(500).json({ error: 'Unable to remove applicant profile.' });
  }
});

if (require.main === module) app.listen(port, () => console.log(`Talent Acquisition Hub running at http://localhost:${port}`));
module.exports = app;
