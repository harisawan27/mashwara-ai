#!/usr/bin/env bash
# =============================================================================
# Mashwara AI — Google Cloud Run Production Deployment Script (Bash)
# =============================================================================
# Deploys the FastAPI backend to Google Cloud Run while safely preserving
# all existing production secrets (DATABASE_URL, JWT, Gemini, etc.) and
# canonicalizing GOOGLE_CLIENT_ID for direct Google Identity Services.
# =============================================================================

set -e

SERVICE="mashwara-ai-api"
REGION="asia-south1"
GOOGLE_CLIENT_ID="971578232755-a7f5t6c31if3k69t9udurfiac48nnjj3.apps.googleusercontent.com"

echo "🏛️ Deploying $SERVICE to Cloud Run in $REGION..."

# 1. Update/ensure GOOGLE_CLIENT_ID persists across every revision
echo "Updating GOOGLE_CLIENT_ID configuration (preserving existing env vars)..."
gcloud run services update "$SERVICE" \
    --region "$REGION" \
    --update-env-vars "GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID"

# 2. Deploy backend from source with GOOGLE_CLIENT_ID enforced
echo "Building and deploying backend container..."
gcloud run deploy "$SERVICE" \
    --source . \
    --region "$REGION" \
    --update-env-vars "GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID"

echo "✅ Cloud Run deployment completed successfully!"
