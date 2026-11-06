# STK SMP website

All website pages are now together directly inside `public/`. CSS, JavaScript, and images stay in their own folders.

## 1. Add your images

Create `public/assets/` and put your image files there using these exact names:

- `stklogo.png`
- `stkheader.png`
- `shards.png`
- `ranks.png`
- `battlepass.png`
- `crates.png`
- `stksmp.png`
- `paypal.png`
- `cashapp.png`
- `venmo.png`

## 2. Run it on Windows

You need Node.js 20 or newer. Open the extracted `stk-smp-website` folder in VS Code, then open Terminal > New Terminal and run:

```powershell
npm install
Copy-Item .env.example .env
```

Open `.env` and replace the placeholder values for `SESSION_SECRET` and `ADMIN_PASSWORD` with your own private values. Then run:

```powershell
npm start
```

Open `http://localhost:3000` in your browser. Keep the terminal window open while using the site.

For a visual preview only, you can also open the project folder in VS Code and use Live Server on the top-level `index.html`, or open `public/index.html`. CSS and page navigation now use relative paths, so the design should display in that preview. Applications, reports, uploads, and staff login still require the Node server.

## 3. Pages

All HTML pages are directly in `public/`:

- `index.html` — Home
- `store.html` — Store categories
- `store-shards.html`, `store-ranks.html`, `store-battlepass.html`, `store-crates.html` — Store details
- `applications.html` — Applications
- `apply-admin.html`, `apply-media.html`, `apply-builder.html` — Application forms
- `report.html` — Player reports
- `admin.html` — Private staff dashboard

CSS is in `public/css/`, JavaScript is in `public/js/`, and images go in `public/assets/`.

## 4. Security and hosting

Before making the site public, host it on a Node.js service behind HTTPS, use a unique admin password and long random session secret, and keep `.env` and `private-data/` private. Back up the private database and uploads. Add a privacy policy and a retention period before collecting real player information.

The admin password is hashed server-side and is not stored in public website code. The staff dashboard is at `/admin.html`.

## 5. Important limitations

- The site does not process payments. Store purchase links direct players to Discord.
- CraftRank's live rank is not verified unless a documented API endpoint is configured. The page links to the server listing.
- Live social status and Microsoft sign-in are not enabled.
- The image assets listed above were not included in the request; add your own files with those names.
- The original server details mentioned two Bedrock ports: `18765` and `18675`. Confirm which is correct before publishing.
