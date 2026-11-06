#!/usr/bin/env bash
# Deploy Zimara to Google Cloud (Cloud Run + Cloud SQL PostgreSQL) in Dammam, Saudi Arabia.
# Run from Google Cloud Shell inside the repository folder:   bash deploy/gcp-deploy.sh
# Safe to run again: it creates only what is missing, then redeploys the latest code.
set -euo pipefail

REGION="${REGION:-me-central2}"     # Dammam
SERVICE="${SERVICE:-zimara}"
INSTANCE="${INSTANCE:-zimara-db}"
TIER="${TIER:-db-g1-small}"

PROJECT="$(gcloud config get-value project 2>/dev/null || true)"
if [ -z "$PROJECT" ] || [ "$PROJECT" = "(unset)" ]; then
  echo "اختر المشروع أول:  gcloud config set project <PROJECT_ID>"
  exit 1
fi
echo "== المشروع: $PROJECT · المنطقة: $REGION"

echo "== 1/6 تفعيل الخدمات المطلوبة"
gcloud services enable run.googleapis.com sqladmin.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com secretmanager.googleapis.com

echo "== 2/6 قاعدة البيانات PostgreSQL 16 (قد تاخذ 10 دقائق أول مرة)"
if ! gcloud sql instances describe "$INSTANCE" >/dev/null 2>&1; then
  gcloud sql instances create "$INSTANCE" --database-version=POSTGRES_16 --edition=ENTERPRISE \
    --tier="$TIER" --region="$REGION" --storage-size=10 --storage-auto-increase \
    --backup-start-time=03:00 --enable-point-in-time-recovery
fi
gcloud sql databases describe zimara --instance="$INSTANCE" >/dev/null 2>&1 || gcloud sql databases create zimara --instance="$INSTANCE"

echo "== 3/6 الأسرار (كلمة مرور القاعدة ومفتاح التشفير)"
secret_exists() { gcloud secrets describe "$1" >/dev/null 2>&1; }
put_secret() { printf %s "$2" | gcloud secrets create "$1" --data-file=- >/dev/null; }
if ! secret_exists zimara-db-url; then
  PASS="$(openssl rand -base64 30 | tr -dc 'A-Za-z0-9' | head -c 32)"
  gcloud sql users create zimara --instance="$INSTANCE" --password="$PASS" >/dev/null 2>&1 \
    || gcloud sql users set-password zimara --instance="$INSTANCE" --password="$PASS" >/dev/null
  put_secret zimara-db-url "postgresql://zimara:${PASS}@localhost/zimara?host=/cloudsql/${PROJECT}:${REGION}:${INSTANCE}"
fi
# The encryption key protects every EGS private key. It is created once and never replaced by this script.
secret_exists zimara-kek || put_secret zimara-kek "$(openssl rand -base64 32)"
secret_exists zimara-cron || put_secret zimara-cron "$(openssl rand -hex 24)"

echo "== 4/6 الصلاحيات"
PN="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')"
SA="${PN}-compute@developer.gserviceaccount.com"
for ROLE in roles/secretmanager.secretAccessor roles/cloudsql.client roles/run.builder; do
  gcloud projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:${SA}" --role="$ROLE" --condition=None >/dev/null
done

echo "== 5/6 بناء النظام ونشره (5 إلى 10 دقائق)"
gcloud run deploy "$SERVICE" --source . --region "$REGION" --allow-unauthenticated --port 3000 \
  --add-cloudsql-instances "${PROJECT}:${REGION}:${INSTANCE}" \
  --set-secrets "DATABASE_URL=zimara-db-url:latest,ZIMARA_KEY_ENCRYPTION_KEY=zimara-kek:latest,CRON_SECRET=zimara-cron:latest" \
  --update-env-vars "DATABASE_SSL=false" \
  --memory 1Gi --cpu 1 --min-instances 0 --max-instances 3

echo "== 6/6 ضبط الرابط"
URL="$(gcloud run services describe "$SERVICE" --region "$REGION" --format='value(status.url)')"
gcloud run services update "$SERVICE" --region "$REGION" --update-env-vars "APP_URL=${URL}" >/dev/null

cat <<EOF

========================================
  زيمارا جاهز: ${URL}
========================================
رابط تأكيد البريد (لين نربط خدمة البريد) يطلع في السجلات:
  gcloud run services logs read ${SERVICE} --region ${REGION} --limit 50 | grep verify
EOF
