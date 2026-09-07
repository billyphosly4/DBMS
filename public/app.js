import { auth, EmailAuthProvider, onAuthStateChanged, reauthenticateWithCredential, signInWithEmailAndPassword, signOut, updatePassword } from './firebase-config.js';

let applicants = [];
let applicantStream = null;
let uploadedFiles = [];
const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
const formatCurrency = (value) => new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', currencyDisplay: 'symbol', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value) || 0);

function renderMetrics() {
  const verified = applicants.filter((applicant) => String(applicant.documentUrl || '').trim()).length;
  const complianceScore = applicants.length ? Math.round((verified / applicants.length) * 100) : 100;
  const totalRevenue = applicants.reduce((sum, applicant) => sum + (Number.isFinite(Number(applicant.serviceFee)) ? Number(applicant.serviceFee) : 0), 0);
  const cards = [['Active European Placements', applicants.length.toLocaleString(), 'LIVE', 'candidates in the placement control plane', 'globe-2'], ['Visa & Work Permit Queue', `${Math.max(applicants.length - verified, 0)}`, 'QUEUE', 'profiles awaiting immigration verification', 'file-check-2'], ['EU Compliance Score', `${complianceScore}%`, 'READY', 'document readiness across the EU pipeline', 'shield-check'], ['Total Agency Revenue Logged', formatCurrency(totalRevenue), 'KES', 'service fees recorded in Kenyan shillings', 'banknote'], ['Live sync status', applicantStream ? 'CONNECTED' : 'WAITING', 'STREAM', 'euro_applicants listener', 'radio-tower']];
  $('#metrics').innerHTML = cards.map(([label, value, marker, detail, icon]) => `<article class="metric-card"><div class="metric-top"><span>${label}</span><span class="metric-icon"><i data-lucide="${icon}"></i></span></div><div class="metric-bottom"><div><div class="metric-value text-zinc-100 transition-colors duration-300">${value}</div><div class="metric-detail">${detail}</div></div><span class="metric-change ${marker === 'LIVE' || marker === 'STREAM' ? 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded px-2 py-1' : ''}">${marker}</span></div></article>`).join('');
}

function renderAnalytics() {
  const destinations = [['Germany Pipeline', 'Germany', 'Tech / Engineering'], ['United Kingdom Pipeline', 'United Kingdom', 'Healthcare / NHS Staffing'], ['Ireland & Netherlands Pool', ['Ireland', 'Netherlands'], 'Finance / Corporate']];
  const counts = destinations.map(([, country]) => applicants.filter((applicant) => Array.isArray(country) ? country.includes(applicant.destinationCountry) : applicant.destinationCountry === country).length);
  const max = Math.max(...counts, 1);
  $('#tier-bars').innerHTML = destinations.map(([label, , sector], index) => `<div class="status-bar-row"><span><strong>${label}</strong><small>${sector}</small></span><div class="status-track bg-[#1a1e29] h-1.5 w-full rounded-full"><i class="status-fill bg-blue-600 transition-all duration-500" style="width:${(counts[index] / max) * 100}%"></i></div><strong>${counts[index]}</strong></div>`).join('');
  const verified = applicants.filter((applicant) => String(applicant.documentUrl || '').trim()).length;
  const ready = applicants.length ? Math.round((verified / applicants.length) * 100) : 100;
  $('#document-ready').textContent = `${ready}%`;
  $('#document-summary').textContent = `${verified} of ${applicants.length} profiles document-ready`;
  $('#document-line-fill').style.width = `${ready}%`;
}

function initials(name) { return String(name || '').split(' ').map((part) => part[0]).join('').slice(0, 2); }
function renderApplicants() {
  const tableBody = $('#ordersTableBody');
  const query = $('#applicant-search')?.value.trim().toLowerCase() || '';
  const records = query ? applicants.filter((applicant) => [applicant.applicantName, applicant.targetRole, applicant.documentUrl, applicant.destinationCountry].some((value) => String(value).toLowerCase().includes(query))) : applicants;
  $('#queue-count').textContent = `${records.length} ${records.length === 1 ? 'RECORD' : 'RECORDS'}`;
  tableBody.innerHTML = '';
  if (!records.length) {
    tableBody.innerHTML = '<tr><td colspan="6" class="empty-state">Awaiting talent pool synchronization...</td></tr>';
    return;
  }
  records.forEach((applicant) => {
    const documentUrl = applicant.documentUrl || applicant.attachedDocuments;
    const documentCell = /^https?:\/\//i.test(String(documentUrl || '')) ? `<a href="${escapeHtml(documentUrl)}" target="_blank" rel="noopener noreferrer" class="text-blue-400 hover:text-blue-300 font-semibold transition hover:underline"><span class="document-chip">📄 View Candidate Document</span></a>` : `<span class="document-chip"><i data-lucide="paperclip"></i>${escapeHtml(documentUrl || 'No document')}</span>`;
    const fee = Number.isFinite(Number(applicant.serviceFee)) ? Number(applicant.serviceFee) : 0;
    const paymentClass = applicant.paymentStatus === 'Fully Paid' ? 'payment-paid' : applicant.paymentStatus === 'Deposit Settled' ? 'payment-deposit' : 'payment-unpaid';
    const ledgerCell = `<div class="ledger-cell"><span class="fee-tag">${formatCurrency(fee)}</span><span class="payment-badge ${paymentClass}">${escapeHtml(applicant.paymentStatus || 'Unpaid Deposit')}</span></div>`;
    const countryClass = applicant.destinationCountry === 'Germany' ? 'destination-germany' : applicant.destinationCountry === 'United Kingdom' ? 'destination-uk' : 'destination-neutral';
    const destinationCell = `<span class="destination-badge ${countryClass}">${escapeHtml(applicant.destinationCountry || 'Unassigned')}</span>`;
    tableBody.innerHTML += `<tr class="applicant-row" data-applicant-id="${escapeHtml(applicant.id)}"><td><div class="customer"><span class="customer-avatar">${escapeHtml(initials(applicant.applicantName))}</span><span class="applicant-name">${escapeHtml(applicant.applicantName)}</span></div></td><td>${escapeHtml(applicant.targetRole)}</td><td>${documentCell}</td><td>${ledgerCell}</td><td class="destination-cell">${destinationCell}</td><td class="actions-cell"><button class="delete-applicant" type="button" data-applicant-id="${escapeHtml(applicant.id)}" aria-label="Delete applicant profile"><i data-lucide="trash-2"></i></button></td></tr>`;
  });
  lucide.createIcons();
}
function render() { renderMetrics(); renderAnalytics(); renderApplicants(); lucide.createIcons(); $('#applicant-count').textContent = applicants.length; }
function setConnection(label, live) { $('#connection-label').textContent = label; $('.status-light').style.background = live ? '#86b9a1' : '#cfaa68'; $('#stream-state').textContent = live ? 'connected to euro_applicants' : 'awaiting connection'; }
async function authenticatedFetch(url, options = {}) { if (!auth.currentUser) throw new Error('Administrator authentication is required.'); const token = await auth.currentUser.getIdToken(); return fetch(url, { ...options, headers: { ...(options.headers || {}), Authorization: `Bearer ${token}` } }); }

function closeStream() { if (applicantStream) { applicantStream.close(); applicantStream = null; } }
async function startApplicantStream() {
  closeStream();
  if (!auth.currentUser) return;
  const token = await auth.currentUser.getIdToken();
  applicantStream = new EventSource(`/api/live-stream?token=${encodeURIComponent(token)}`);
  applicantStream.addEventListener('applicants', (event) => { const payload = JSON.parse(event.data); applicants = Array.isArray(payload.applicants) ? payload.applicants : []; setConnection('Firestore applicant stream', true); render(); });
  applicantStream.addEventListener('error', () => { setConnection('Stream reconnecting', false); });
}
async function refreshApplicants() { try { const response = await authenticatedFetch('/api/orders'); const payload = await response.json(); if (!response.ok) throw new Error(payload.error || 'Unable to read applicant profiles.'); applicants = Array.isArray(payload.applicants) ? payload.applicants : []; render(); showToast('Applicant pool synchronized from Firestore.'); } catch (error) { setConnection(error.message, false); console.warn(error.message); } }
function setUploadStatus(message, uploaded = false) { const status = $('#upload-status'); if (!status) return; status.textContent = message; status.classList.toggle('uploaded', uploaded); }
function openDrawer() { $('#formModal').classList.remove('hidden'); $('#formModal').classList.add('open'); setUploadStatus('Ready to upload'); document.body.style.overflow = 'hidden'; }
function closeDrawer() { $('#formModal').classList.remove('open'); document.body.style.overflow = ''; }
async function submitApplicant(event) { event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement); const uploader = $('uc-file-uploader-regular[ctx-name="my-uploader"]'); const uploaderCtx = $('#uploaderctx').getAPI(); const fileEntries = uploaderCtx.getOutputCollectionState().successEntries; const uploadedFile = fileEntries.find((entry) => /^https?:\/\//i.test(entry.cdnUrl || '')); const button = $('#submit-applicant'); button.disabled = true; button.textContent = 'Ingesting profile...'; try { if (!uploadedFile?.cdnUrl) throw new Error('Please upload a CV or work certificate before submitting.'); const payload = { applicantName: String(form.get('applicantName') || '').trim(), targetRole: String(form.get('targetRole') || '').trim(), documentUrl: uploadedFile.cdnUrl, destinationCountry: String(form.get('destinationCountry') || '').trim(), serviceFee: Number(form.get('serviceFee') || 0), paymentStatus: String(form.get('paymentStatus') || 'Unpaid Deposit').trim(), languageProficiency: String(form.get('languageProficiency') || 'No Certificate').trim() }; const response = await authenticatedFetch('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); const responsePayload = await response.json(); if (!response.ok) throw new Error(responsePayload.error || 'Unable to ingest candidate.'); formElement.reset(); if (typeof uploader.clear === 'function') uploader.clear(); else uploaderCtx.removeAllFiles(); setUploadStatus('Ready to upload'); $('#formModal').classList.add('hidden'); closeDrawer(); showToast('European candidate profile ingested.'); } catch (error) { alert(error.message); } finally { button.disabled = false; button.innerHTML = '<i data-lucide="upload-cloud"></i>Ingest candidate profile'; lucide.createIcons(); } }
async function deleteApplicant(id) { if (!window.confirm('Delete this applicant profile from Firestore?')) return; try { const response = await authenticatedFetch(`/api/applicants/${encodeURIComponent(id)}`, { method: 'DELETE' }); if (!response.ok) throw new Error('Unable to delete applicant profile.'); showToast('Applicant profile removed.'); } catch (error) { alert(error.message); } }
function showDetails(id) { const applicant = applicants.find((record) => record.id === id); if (!applicant) return; $('#detail-content').innerHTML = `<div class="detail-hero"><span class="customer-avatar large">${escapeHtml(initials(applicant.applicantName))}</span><div><strong>${escapeHtml(applicant.applicantName)}</strong><span>${escapeHtml(applicant.id)}</span></div></div><dl class="detail-list"><div><dt>Target Euro role & sector</dt><dd>${escapeHtml(applicant.targetRole)}</dd></div><div><dt>Destination country</dt><dd>${escapeHtml(applicant.destinationCountry)}</dd></div><div><dt>Candidate document</dt><dd>${escapeHtml(applicant.documentUrl)}</dd></div></dl>`; $('#detail-backdrop').classList.add('open'); document.body.style.overflow = 'hidden'; }
function closeDetails() { $('#detail-backdrop').classList.remove('open'); document.body.style.overflow = ''; }
function showToast(message) { const toast = $('#console-toast'); toast.textContent = message; toast.classList.add('visible'); clearTimeout(showToast.timeout); showToast.timeout = setTimeout(() => toast.classList.remove('visible'), 2800); }
function openSettings() { let modal = $('#settings-modal'); if (!modal) { modal = document.createElement('div'); modal.id = 'settings-modal'; modal.className = 'detail-backdrop open'; modal.innerHTML = '<aside class="detail-panel"><div class="detail-header"><div><div class="eyebrow"><i data-lucide="settings"></i>Workspace controls</div><h2>Settings</h2></div><button class="icon-button" type="button" id="close-settings" aria-label="Close settings"><i data-lucide="x"></i></button></div><form id="password-form" class="drawer-form"><p class="drawer-note">Update the password for the authenticated administrator account.</p><label>Current password<input name="currentPassword" type="password" autocomplete="current-password" required></label><label>New password<input name="newPassword" type="password" autocomplete="new-password" minlength="8" required></label><label>Confirm new password<input name="confirmPassword" type="password" autocomplete="new-password" minlength="8" required></label><p class="auth-error" id="password-error" role="alert"></p><button class="primary-button full-width" type="submit" id="password-submit"><i data-lucide="key-round"></i>Change password</button><button class="soft-button full-width" type="button" id="refresh-site"><i data-lucide="refresh-cw"></i>Refresh site</button></form></aside>'; document.body.appendChild(modal); $('#close-settings').addEventListener('click', closeSettings); modal.addEventListener('click', (event) => { if (event.target === modal) closeSettings(); }); $('#refresh-site').addEventListener('click', () => window.location.reload()); $('#password-form').addEventListener('submit', changePassword); lucide.createIcons(); } modal.classList.add('open'); document.body.style.overflow = 'hidden'; }
function closeSettings() { const modal = $('#settings-modal'); if (modal) modal.classList.remove('open'); document.body.style.overflow = ''; }
async function changePassword(event) { event.preventDefault(); const form = event.currentTarget; const values = new FormData(form); const error = $('#password-error'); const button = $('#password-submit'); error.textContent = ''; if (values.get('newPassword') !== values.get('confirmPassword')) { error.textContent = 'New passwords do not match.'; return; } button.disabled = true; button.textContent = 'Updating password...'; try { const user = auth.currentUser; if (!user?.email) throw new Error('No authenticated administrator session found.'); const credential = EmailAuthProvider.credential(user.email, values.get('currentPassword')); await reauthenticateWithCredential(user, credential); await updatePassword(user, values.get('newPassword')); form.reset(); closeSettings(); showToast('Administrator password updated.'); } catch (passwordError) { error.textContent = passwordError.code === 'auth/wrong-password' || passwordError.code === 'auth/invalid-credential' ? 'The current password is incorrect.' : passwordError.message || 'Unable to update the password.'; } finally { button.disabled = false; button.innerHTML = '<i data-lucide="key-round"></i>Change password'; lucide.createIcons(); } }
function navigate(section, button) { document.querySelectorAll('.nav-item').forEach((item) => item.classList.toggle('active', item === button)); if (section === 'applicants') $('#ordersTableBody').scrollIntoView({ behavior: 'smooth', block: 'start' }); if (section === 'analytics') $('#analytics-panel').scrollIntoView({ behavior: 'smooth', block: 'start' }); if (section === 'settings') openSettings(); }
async function login(event) { event.preventDefault(); const button = $('#login-submit'); const error = $('#auth-error'); button.disabled = true; error.textContent = ''; try { await signInWithEmailAndPassword(auth, $('#login-email').value.trim(), $('#login-password').value); } catch (authError) { error.textContent = authError.code === 'auth/unauthorized-domain' ? 'Add this Vercel domain to Firebase authorized domains.' : 'The admin email or password is incorrect.'; } finally { button.disabled = false; } }
function showApp(user) { $('#auth-screen').classList.add('hidden'); $('.app-shell').classList.remove('locked'); $('#signed-in-email').textContent = user.email || 'Authenticated session'; render(); startApplicantStream(); refreshApplicants(); }
function showLogin() { closeStream(); $('#auth-screen').classList.remove('hidden'); $('.app-shell').classList.add('locked'); }

function configureEuroTransitShell() {
  document.title = 'NOva Jobs';
  document.querySelectorAll('.brand strong').forEach((element) => { element.textContent = 'NOva Jobs'; });
  document.querySelectorAll('.brand small').forEach((element) => { element.textContent = 'GLOBAL PLACEMENT CONTROL PLANE'; });
  $('.nav-label').textContent = 'European placement operations';
  $('.greeting h1').textContent = 'NOva Jobs';
  $('.page-heading h2').textContent = 'Global placement control plane';
  $('.page-heading p').textContent = 'Track international candidates, destination pipelines, and European compliance readiness.';
  $('.analytics-heading h3').textContent = 'European destination matrix';
  $('.analytics-heading p').textContent = 'Candidate volume across priority European markets and sectors.';
  const form = $('#orderForm');
  const labels = form.querySelectorAll('label');
  labels[0].firstChild.nodeValue = 'Applicant full name';
  labels[1].firstChild.nodeValue = 'Target Euro role & sector';
  labels[2].firstChild.nodeValue = 'Work certificates and candidate document';
  const destinationSelect = form.querySelector('select');
  destinationSelect.name = 'destinationCountry';
  destinationSelect.innerHTML = '<option value="">Select destination</option><option>Germany</option><option>United Kingdom</option><option>Ireland</option><option>Netherlands</option>';
  destinationSelect.parentElement.insertAdjacentHTML('afterend', '<label>Service fee amount (KSh)<input name="serviceFee" type="number" min="0" step="0.01" inputmode="decimal" placeholder="e.g. 1,500.00"></label><label>Payment status<select name="paymentStatus"><option>Unpaid Deposit</option><option>Deposit Settled</option><option>Fully Paid</option></select></label><label>Language proficiency<select name="languageProficiency"><option>English - IELTS/TOEFL</option><option>German - B1/B2</option><option>No Certificate</option></select></label>');
  document.querySelector('table thead th:nth-child(3)').textContent = 'Candidate document';
  document.querySelector('table thead th:nth-child(4)').textContent = 'Financial Ledger & Compliance';
  document.querySelector('table thead th:nth-child(5)').textContent = 'Destination country';
}

// Uploadcare emits successful upload results on the shared context provider.
$('#uploaderctx').addEventListener('common-upload-success', (event) => {
  uploadedFiles = event.detail.successEntries.map(({ uuid, cdnUrl }) => ({ uuid, cdnUrl }));
  setUploadStatus('Uploaded', true);
  console.log(uploadedFiles);
});

configureEuroTransitShell();
$('#current-date').textContent = new Intl.DateTimeFormat('en-KE', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date());
$('#login-form').addEventListener('submit', login); $('#logout-button').addEventListener('click', () => signOut(auth)); $('#top-new-applicant').addEventListener('click', openDrawer); $('#panel-new-applicant').addEventListener('click', openDrawer); $('#close-drawer').addEventListener('click', closeDrawer); $('#formModal').addEventListener('click', (event) => { if (event.target.id === 'formModal') closeDrawer(); }); $('#orderForm').addEventListener('submit', submitApplicant); $('#refresh-applicants').addEventListener('click', refreshApplicants); $('#ordersTableBody').addEventListener('click', (event) => { const deleteButton = event.target.closest('.delete-applicant'); if (deleteButton) return deleteApplicant(deleteButton.dataset.applicantId); const row = event.target.closest('.applicant-row'); if (row) showDetails(row.dataset.applicantId); }); $('#search-toggle').addEventListener('click', () => { $('#search-popover').classList.toggle('open'); if ($('#search-popover').classList.contains('open')) $('#applicant-search').focus(); }); $('#close-search').addEventListener('click', () => { $('#search-popover').classList.remove('open'); $('#applicant-search').value = ''; renderApplicants(); }); $('#applicant-search').addEventListener('input', renderApplicants); $('#notification-toggle').addEventListener('click', () => $('#notification-popover').classList.toggle('open')); $('#close-notifications').addEventListener('click', () => $('#notification-popover').classList.remove('open')); document.querySelectorAll('.nav-item').forEach((button) => button.addEventListener('click', () => navigate(button.dataset.section, button))); $('#close-detail').addEventListener('click', closeDetails); $('#detail-backdrop').addEventListener('click', (event) => { if (event.target.id === 'detail-backdrop') closeDetails(); });
onAuthStateChanged(auth, (user) => user ? showApp(user) : showLogin());
