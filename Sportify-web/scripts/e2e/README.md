# Coach first-week walk (web, headless Chrome)

Walks the pilot flow through the real web app and saves a screenshot per step:
coach signs up → academy → batch → invite link → 4 students sign up from the
link and join → coach records the class (one match the coach played stays
pending) → a student confirms it → student dashboard (rating, weekly streak,
season) → batch season standings → notification settings → WAC on
`/admin/metrics`.

It runs against a local stack, never production. The server only trusts
emulator tokens with `SPORTIFY_E2E=1` set and never on Netlify (`lib/firebaseAdmin.ts`):

```bash
# 1. Firebase Auth emulator (Java needed), from any empty directory
echo '{"emulators":{"auth":{"port":9099},"ui":{"enabled":false}}}' > firebase.json
npx firebase-tools emulators:start --only auth --project demo-sportify

# 2. An empty local database with the migrations applied
MYSQL_HOST=127.0.0.1 MYSQL_USER=root MYSQL_PASSWORD=test MYSQL_DATABASE=sportify_e2e MYSQL_SSL=false npm run db:migrate

# 3. The platform admin used for the metrics step
curl -X POST -H "Authorization: Bearer owner" -H "Content-Type: application/json" \
  http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/demo-sportify/accounts \
  -d '{"localId":"ops-founder","email":"ops@sportify.test","password":"pilot-pass-1"}'
mysql -h127.0.0.1 -uroot -ptest sportify_e2e -e "INSERT INTO Users (user_id, name, email) VALUES ('ops-founder', 'Sportify Ops', 'ops@sportify.test')"

# 4. The web app on :3210, pointed at both
MYSQL_HOST=127.0.0.1 MYSQL_USER=root MYSQL_PASSWORD=test MYSQL_DATABASE=sportify_e2e MYSQL_SSL=false \
SPORTIFY_E2E=1 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
NEXT_PUBLIC_FIREBASE_API_KEY=demo-key NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-sportify \
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=demo-sportify.firebaseapp.com NEXT_PUBLIC_FIREBASE_APP_ID=1:1:web:1 \
PLATFORM_ADMIN_UIDS=ops-founder npx next dev -p 3210

# 5. The walk (uses the installed Google Chrome)
npm i --no-save playwright-core && node scripts/e2e/coach-walk.mjs
```

Start from an empty database and emulator each time (the walk signs up fixed emails).
