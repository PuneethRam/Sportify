#!/bin/bash
# Sets Firebase Admin env vars on Netlify from firebase.json
# Run after: netlify login && netlify link

set -e

FIREBASE_JSON="./firebase.json"

PROJECT_ID=$(python3 -c "import json; d=json.load(open('$FIREBASE_JSON')); print(d['project_id'])")
CLIENT_EMAIL=$(python3 -c "import json; d=json.load(open('$FIREBASE_JSON')); print(d['client_email'])")
PRIVATE_KEY=$(python3 -c "import json; d=json.load(open('$FIREBASE_JSON')); print(d['private_key'])")

echo "Setting FIREBASE_ADMIN_PROJECT_ID..."
netlify env:set FIREBASE_ADMIN_PROJECT_ID "$PROJECT_ID"

echo "Setting FIREBASE_ADMIN_CLIENT_EMAIL..."
netlify env:set FIREBASE_ADMIN_CLIENT_EMAIL "$CLIENT_EMAIL"

echo "Setting FIREBASE_ADMIN_PRIVATE_KEY..."
netlify env:set FIREBASE_ADMIN_PRIVATE_KEY "$PRIVATE_KEY"

echo ""
echo "Done! Trigger a redeploy: netlify deploy --prod --build"
