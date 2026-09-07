// Firebase Web SDK configuration. This API key is intended for browser use;
// keep service-account credentials out of this file and out of the public folder.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAnalytics } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-analytics.js';
import { EmailAuthProvider, getAuth, onAuthStateChanged, reauthenticateWithCredential, signInWithEmailAndPassword, signOut, updatePassword } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

// Your web app's Firebase configuration.
const firebaseConfig = {
  apiKey: 'AIzaSyBn6TvqhiNh8dnY90pb35SUjiW4N84_KfM',
  authDomain: 'admin-61d58.firebaseapp.com',
  projectId: 'admin-61d58',
  storageBucket: 'admin-61d58.firebasestorage.app',
  messagingSenderId: '793646099625',
  appId: '1:793646099625:web:84fa28eb68be8769970db8',
  measurementId: 'G-Q1SE0XRH6J',
};

const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const auth = getAuth(app);
window.firebaseWebApp = app;
window.firebaseAnalytics = analytics;
export { EmailAuthProvider, auth, onAuthStateChanged, reauthenticateWithCredential, signInWithEmailAndPassword, signOut, updatePassword };
