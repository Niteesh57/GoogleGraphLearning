#!/bin/bash

# Exit immediately if a command exits with a non-zero status
set -e

echo "===================================================="
echo "🚀 NeuroGraph LIVE - Automated GCP Deployment Script"
echo "===================================================="
echo "This script will:"
echo "1. Enable necessary Google Cloud APIs"
echo "2. Build & Deploy the Backend to Cloud Run"
echo "3. Build & Deploy the Frontend to Cloud Run"
echo "===================================================="
echo ""

# 1. Get Project Settings
read -p "Enter your Google Cloud Project ID: " PROJECT_ID
gcloud config set project $PROJECT_ID

REGION="us-central1"
read -p "Enter your preferred region [default: us-central1]: " INPUT_REGION
REGION=${INPUT_REGION:-$REGION}

echo ""
echo "✅ Project: $PROJECT_ID | Region: $REGION"
echo ""

# 2. Get API Key
echo "NeuroGraph LIVE requires a Gemini API Key from Google AI Studio."
read -sp "Enter your GEMINI_API_KEY: " GEMINI_API_KEY
echo ""

# 3. Enable Required APIs
echo ""
echo "Enabling required Cloud APIs (Cloud Run, Cloud Build, Artifact Registry, Vertex AI)..."
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  aiplatform.googleapis.com
echo "✅ APIs Enabled."
echo ""

# 4. Artifact Registry Setup
REPO_NAME="cloud-run-source-lib"
echo "Checking Artifact Registry repository..."
if ! gcloud artifacts repositories describe $REPO_NAME --location=$REGION >/dev/null 2>&1; then
  echo "Creating Artifact Registry repository: $REPO_NAME..."
  gcloud artifacts repositories create $REPO_NAME \
    --repository-format=docker \
    --location=$REGION \
    --description="Docker repository for NeuroGraph LIVE"
else
  echo "✅ Repository $REPO_NAME exists."
fi
echo ""

# 5. Build and Deploy Backend
BACKEND_IMAGE="$REGION-docker.pkg.dev/$PROJECT_ID/$REPO_NAME/backend:latest"
echo "===================================================="
echo "⚙️ Building and Deploying Backend"
echo "===================================================="
cd app

echo "Building Backend Image..."
docker build -t $BACKEND_IMAGE .
docker push $BACKEND_IMAGE

echo "Deploying Backend to Cloud Run..."
gcloud run deploy backend \
  --image $BACKEND_IMAGE \
  --platform managed \
  --region $REGION \
  --allow-unauthenticated \
  --set-env-vars "GEMINI_API_KEY=$GEMINI_API_KEY" \
  --memory 2Gi \
  --timeout 300 \
  --quiet

# Retrieve the deployed URL
BACKEND_URL=$(gcloud run services describe backend --platform managed --region $REGION --format 'value(status.url)')
echo "✅ Backend Live URL: $BACKEND_URL"
echo ""

# 6. Build and Deploy Frontend
cd ../frontend
FRONTEND_IMAGE="$REGION-docker.pkg.dev/$PROJECT_ID/$REPO_NAME/frontend:latest"

echo "===================================================="
echo "🌐 Building and Deploying Frontend"
echo "===================================================="
echo "Building Frontend Image (injecting BACKEND_URL)..."
docker build --build-arg VITE_API_URL=$BACKEND_URL -t $FRONTEND_IMAGE .
docker push $FRONTEND_IMAGE

echo "Deploying Frontend to Cloud Run..."
gcloud run deploy frontend \
  --image $FRONTEND_IMAGE \
  --platform managed \
  --region $REGION \
  --allow-unauthenticated \
  --port 80 \
  --quiet

FRONTEND_URL=$(gcloud run services describe frontend --platform managed --region $REGION --format 'value(status.url)')

echo "===================================================="
echo "🎉 DEPLOYMENT COMPLETE!"
echo "===================================================="
echo "🚀 Your Full-Stack Application is Live:"
echo "   Frontend Web UI : $FRONTEND_URL"
echo "   Backend API     : $BACKEND_URL"
echo "===================================================="
