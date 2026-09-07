# Northstar Commerce OS

Express, Firebase Authentication, and Firestore admin dashboard.

## Deploy to Vercel

1. Push this repository to GitHub, GitLab, or Bitbucket.
2. Import the repository into Vercel.
3. In Vercel project settings, add the server-only environment variable `FIREBASE_SERVICE_ACCOUNT` for Production, Preview, and Development.
4. Paste the complete contents of a newly generated Firebase Admin service-account JSON file as the value. Do not paste it into `public/` and do not commit it.
5. Deploy. Vercel uses `api/index.js` and `vercel.json` to run the Express app as a serverless function.

The browser Firebase configuration in `public/firebase-config.js` is for Firebase Authentication and Analytics. The Admin service-account JSON is used only by the serverless backend.

## Local development

Keep `serviceAccountKey.json` beside `server.js` or set `GOOGLE_APPLICATION_CREDENTIALS` to its path. Then run:

```bash
npm install
npm start
```

Open `http://localhost:3000`.

Before deployment, revoke any service-account key that was exposed in chat or source control and generate a replacement.
