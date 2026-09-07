import { auth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from './firebase-config.js';

let applicants = [];
let applicantStream = null;
let uploadedFiles = [];
const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));

function renderMetrics() {
  const verified = applicants.filter((applicant) => applicant.attachedDocuments.trim()).length;
  const tiers = new Set(applicants.map((applicant) => applicant.talentClassification).filter(Boolean)).size;
  const cards = [['Total managed applicants', applicants.length.toLocaleString(), 'LIVE', 'Firestore applicant documents', 'users'], ['Pending verification metrics', `${Math.max(applicants.length - verified, 0)}`, 'QUEUE', 'profiles needing document review', 'file-check-2'], ['Talent classification spread', tiers.toString(), 'TIERS', 'active candidate segments', 'layers-3'], ['Live sync status', applicantStream ? 'CONNECTED' : 'WAITING', 'STREAM', 'agency_applicants listener', 'radio-tower']];
  $('#metrics').innerHTML = cards.map(([label, value, marker, detail, icon]) => `<article class="metric-card"><div class="metric-top"><span>${label}</span><span class="metric-icon"><i data-lucide="${icon}"></i></span></div><div class="metric-bottom"><div><div class="metric-value">${value}</div><div class="metric-detail">${detail}</div></div><span class="metric-change">${marker}</span></div></article>`).join('');
}

function renderAnalytics() {
  const tiers = ['Executive Search', 'Mid-Level Professional', 'Entry Level Staffing'];
  const counts = tiers.map((tier) => applicants.filter((applicant) => applicant.talentClassification === tier).length);
  const max = Math.max(...counts, 1);
  $('#tier-bars').innerHTML = tiers.map((tier, index) => `<div class="status-bar-row"><span>${tier}</span><div class="status-track"><i class="status-fill tier-${index}" style="width:${(counts[index] / max) * 100}%"></i></div><strong>${counts[index]}</strong></div>`).join('');
  const ready = applicants.length ? Math.round((applicants.filter((applicant) => applicant.attachedDocuments.trim()).length / applicants.length) * 100) : 0;
  $('#document-ready').textContent = `${ready}%`;
  $('#document-summary').textContent = `${applicants.filter((applicant) => applicant.attachedDocuments.trim()).length} of ${applicants.length} profiles documented`;
  $('#document-line-fill').style.width = `${ready}%`;
}

function initials(name) { return String(name || '').split(' ').map((part) => part[0]).join('').slice(0, 2); }
function renderApplicants() {
  const tableBody = $('#applicants-body');
  const query = $('#applicant-search')?.value.trim().toLowerCase() || '';
  const records = query ? applicants.filter((applicant) => [applicant.applicantName, applicant.targetRole, applicant.attachedDocuments, applicant.talentClassification].some((value) => String(value).toLowerCase().includes(query))) : applicants;
  $('#queue-count').textContent = `${records.length} ${records.length === 1 ? 'RECORD' : 'RECORDS'}`;
  tableBody.innerHTML = '';
  if (!records.length) {
    tableBody.innerHTML = '<tr><td colspan="5" class="empty-state">Awaiting talent pool synchronization...</td></tr>';
    return;
  }
  records.forEach((applicant) => {
    const documentUrl = applicant.documentUrl || applicant.attachedDocuments;
    const documentCell = /^https?:\/\//i.test(String(documentUrl || '')) ? `<a href="${escapeHtml(documentUrl)}" target="_blank" rel="noopener noreferrer" class="text-blue-400 hover:underline"><span class="document-chip">📄 View Resume</span></a>` : `<span class="document-chip"><i data-lucide="paperclip"></i>${escapeHtml(documentUrl || 'No document')}</span>`;
    tableBody.innerHTML += `<tr class="applicant-row" data-applicant-id="${escapeHtml(applicant.id)}"><td><div class="customer"><span class="customer-avatar">${escapeHtml(initials(applicant.applicantName))}</span><span class="applicant-name">${escapeHtml(applicant.applicantName)}</span></div></td><td>${escapeHtml(applicant.targetRole)}</td><td>${documentCell}</td><td><span class="tier-badge tier-${applicant.talentClassification === 'Executive Search' ? 'executive' : applicant.talentClassification === 'Mid-Level Professional' ? 'mid' : 'entry'}">${escapeHtml(applicant.talentClassification)}</span></td><td class="actions-cell"><button class="delete-applicant" type="button" data-applicant-id="${escapeHtml(applicant.id)}" aria-label="Delete applicant profile"><i data-lucide="trash-2"></i></button></td></tr>`;
  });
  lucide.createIcons();
}
function render() { renderMetrics(); renderAnalytics(); renderApplicants(); lucide.createIcons(); $('#applicant-count').textContent = applicants.length; }
function setConnection(label, live) { $('#connection-label').textContent = label; $('.status-light').style.background = live ? '#86b9a1' : '#cfaa68'; $('#stream-state').textContent = live ? 'connected to agency_applicants' : 'awaiting connection'; }
async function authenticatedFetch(url, options = {}) { if (!auth.currentUser) throw new Error('Administrator authentication is required.'); const token = await auth.currentUser.getIdToken(); return fetch(url, { ...options, headers: { ...(options.headers || {}), Authorization: `Bearer ${token}` } }); }

function closeStream() { if (applicantStream) { applicantStream.close(); applicantStream = null; } }
async function startApplicantStream() {
  closeStream();
  if (!auth.currentUser) return;
  const token = await auth.currentUser.getIdToken();
  applicantStream = new EventSource(`/api/applicants/stream?token=${encodeURIComponent(token)}`);
  applicantStream.addEventListener('applicants', (event) => { const payload = JSON.parse(event.data); applicants = Array.isArray(payload.applicants) ? payload.applicants : []; setConnection('Firestore applicant stream', true); render(); });
  applicantStream.addEventListener('error', () => { setConnection('Stream reconnecting', false); });
}
async function refreshApplicants() { try { const response = await authenticatedFetch('/api/applicants'); const payload = await response.json(); if (!response.ok) throw new Error(payload.error || 'Unable to read applicant profiles.'); applicants = Array.isArray(payload.applicants) ? payload.applicants : []; render(); showToast('Applicant pool synchronized from Firestore.'); } catch (error) { setConnection(error.message, false); console.warn(error.message); } }
function openDrawer() { $('#applicant-drawer').classList.add('open'); document.body.style.overflow = 'hidden'; }
function closeDrawer() { $('#applicant-drawer').classList.remove('open'); document.body.style.overflow = ''; }
async function submitApplicant(event) { event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement); const uploader = $('uc-file-uploader-regular[ctx-name="my-uploader"]'); const uploaderCtx = $('#uploaderctx').getAPI(); const collectionState = uploaderCtx.getOutputCollectionState(); const uploadedDocument = collectionState.successEntries.find((entry) => /^https?:\/\//i.test(entry.cdnUrl || '')); const button = $('#submit-applicant'); button.disabled = true; button.textContent = 'Ingesting profile...'; try { if (!uploadedDocument) throw new Error('Please upload a resume or supporting document before submitting.'); const applicantData = Object.fromEntries(form.entries()); applicantData.documentUrl = uploadedDocument.cdnUrl; delete applicantData.attachedDocuments; const response = await authenticatedFetch('/api/applicants', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(applicantData) }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error || 'Unable to ingest applicant.'); if (typeof uploader.clear === 'function') uploader.clear(); else uploaderCtx.removeAllFiles(); formElement.reset(); closeDrawer(); showToast('Applicant profile ingested into Firestore.'); } catch (error) { alert(error.message); } finally { button.disabled = false; button.innerHTML = '<i data-lucide="upload-cloud"></i>Ingest applicant profile'; lucide.createIcons(); } }
async function deleteApplicant(id) { if (!window.confirm('Delete this applicant profile from Firestore?')) return; try { const response = await authenticatedFetch(`/api/applicants/${encodeURIComponent(id)}`, { method: 'DELETE' }); if (!response.ok) throw new Error('Unable to delete applicant profile.'); showToast('Applicant profile removed.'); } catch (error) { alert(error.message); } }
function showDetails(id) { const applicant = applicants.find((record) => record.id === id); if (!applicant) return; $('#detail-content').innerHTML = `<div class="detail-hero"><span class="customer-avatar large">${escapeHtml(initials(applicant.applicantName))}</span><div><strong>${escapeHtml(applicant.applicantName)}</strong><span>${escapeHtml(applicant.id)}</span></div></div><dl class="detail-list"><div><dt>Target position</dt><dd>${escapeHtml(applicant.targetRole)}</dd></div><div><dt>Attached documents</dt><dd>${escapeHtml(applicant.attachedDocuments)}</dd></div><div><dt>Talent classification</dt><dd>${escapeHtml(applicant.talentClassification)}</dd></div></dl>`; $('#detail-backdrop').classList.add('open'); document.body.style.overflow = 'hidden'; }
function closeDetails() { $('#detail-backdrop').classList.remove('open'); document.body.style.overflow = ''; }
function showToast(message) { const toast = $('#console-toast'); toast.textContent = message; toast.classList.add('visible'); clearTimeout(showToast.timeout); showToast.timeout = setTimeout(() => toast.classList.remove('visible'), 2800); }
function navigate(section, button) { document.querySelectorAll('.nav-item').forEach((item) => item.classList.toggle('active', item === button)); if (section === 'applicants') $('#applicants-body').scrollIntoView({ behavior: 'smooth', block: 'start' }); if (section === 'analytics') $('#analytics-panel').scrollIntoView({ behavior: 'smooth', block: 'start' }); if (section === 'settings') showToast('Workspace settings are available in the Firebase Console.'); }
async function login(event) { event.preventDefault(); const button = $('#login-submit'); const error = $('#auth-error'); button.disabled = true; error.textContent = ''; try { await signInWithEmailAndPassword(auth, $('#login-email').value.trim(), $('#login-password').value); } catch (authError) { error.textContent = authError.code === 'auth/unauthorized-domain' ? 'Add this Vercel domain to Firebase authorized domains.' : 'The admin email or password is incorrect.'; } finally { button.disabled = false; } }
function showApp(user) { $('#auth-screen').classList.add('hidden'); $('.app-shell').classList.remove('locked'); $('#signed-in-email').textContent = user.email || 'Authenticated session'; render(); startApplicantStream(); refreshApplicants(); }
function showLogin() { closeStream(); $('#auth-screen').classList.remove('hidden'); $('.app-shell').classList.add('locked'); }

// Uploadcare emits successful upload results on the shared context provider.
$('#uploaderctx').addEventListener('common-upload-success', (event) => {
  uploadedFiles = event.detail.successEntries.map(({ uuid, cdnUrl }) => ({ uuid, cdnUrl }));
  console.log(uploadedFiles);
});

$('#current-date').textContent = new Intl.DateTimeFormat('en-KE', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date());
$('#login-form').addEventListener('submit', login); $('#logout-button').addEventListener('click', () => signOut(auth)); $('#top-new-applicant').addEventListener('click', openDrawer); $('#panel-new-applicant').addEventListener('click', openDrawer); $('#close-drawer').addEventListener('click', closeDrawer); $('#applicant-drawer').addEventListener('click', (event) => { if (event.target.id === 'applicant-drawer') closeDrawer(); }); $('#applicant-form').addEventListener('submit', submitApplicant); $('#refresh-applicants').addEventListener('click', refreshApplicants); $('#applicants-body').addEventListener('click', (event) => { const deleteButton = event.target.closest('.delete-applicant'); if (deleteButton) return deleteApplicant(deleteButton.dataset.applicantId); const row = event.target.closest('.applicant-row'); if (row) showDetails(row.dataset.applicantId); }); $('#search-toggle').addEventListener('click', () => { $('#search-popover').classList.toggle('open'); if ($('#search-popover').classList.contains('open')) $('#applicant-search').focus(); }); $('#close-search').addEventListener('click', () => { $('#search-popover').classList.remove('open'); $('#applicant-search').value = ''; renderApplicants(); }); $('#applicant-search').addEventListener('input', renderApplicants); $('#notification-toggle').addEventListener('click', () => $('#notification-popover').classList.toggle('open')); $('#close-notifications').addEventListener('click', () => $('#notification-popover').classList.remove('open')); document.querySelectorAll('.nav-item').forEach((button) => button.addEventListener('click', () => navigate(button.dataset.section, button))); $('#close-detail').addEventListener('click', closeDetails); $('#detail-backdrop').addEventListener('click', (event) => { if (event.target.id === 'detail-backdrop') closeDetails(); });
onAuthStateChanged(auth, (user) => user ? showApp(user) : showLogin());
