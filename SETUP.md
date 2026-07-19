# Padho Label — GitHub Actions CI/CD Setup Guide

## What this gives you
| | Expo EAS (before) | GitHub Actions (now) |
|---|---|---|
| Build time | 20–40 min (queue) | **~8 min, instant start** |
| Builds/month | 30 max | **Unlimited** |
| Cost | Free tier only | **Always free** |
| Auto-deploy | Manual | **Auto on git push** |

---

## Step 1: Create a GitHub Repository

1. Go to [github.com/new](https://github.com/new)
2. Repository name: `padho-label`
3. Set to **Private**
4. Click **Create repository**
5. GitHub will show you setup commands — copy the `git remote add` line

---

## Step 2: Push the code to GitHub

Open **Terminal** on your Mac and run:

```bash
cd ~/Documents/padho-label

# Link to your new GitHub repo (replace YOUR_USERNAME)
git remote add origin https://github.com/YOUR_USERNAME/padho-label.git

# Set the default branch to main
git branch -M main

# Push everything up
git push -u origin main
```

---

## Step 3: Add your EXPO_TOKEN secret

This allows GitHub Actions to fetch your EAS keystore and submit to Play Store.

1. Get your token: go to [expo.dev/settings/access-tokens](https://expo.dev/settings/access-tokens)
2. Click **Create token** → name it `github-actions` → copy the token
3. In your GitHub repo → **Settings** → **Secrets and variables** → **Actions**
4. Click **New repository secret**:
   - Name: `EXPO_TOKEN`
   - Value: paste the token from step 2
5. Click **Add secret**

---

## Step 4: Test the workflow

After pushing to `main`, the workflow runs automatically. You can also trigger it manually:

1. Go to your repo on GitHub
2. Click the **Actions** tab
3. Click **Android — Build & Submit to Play Store**
4. Click **Run workflow** → **Run workflow**

Watch the live log — the build takes about 8 minutes.

---

## Step 5: Activate the build in Play Console

After the workflow completes successfully:
1. Open [Google Play Console](https://play.google.com/console)
2. Navigate to **Padho Label** → **Internal testing**
3. You'll see the new build — click **Promote release**

---

## Future deploys

From now on, every time you push to `main`, the app automatically builds and submits to Play Store. No manual steps needed.

```bash
# Normal development workflow going forward:
git add -A
git commit -m "your changes"
git push   # triggers build + Play Store submit automatically
```

---

## Where the keystore is stored

Your signing keystore remains on Expo's servers and is fetched automatically during each build via `EXPO_TOKEN`. You don't need to manage it yourself.

To download and backup your keystore at any time:
```bash
cd ~/Documents/padho-label
eas credentials --platform android
```

---

## Optional: OCR secret

The "scan the ingredients label" fallback uses the free [OCR.space](https://ocr.space/ocrapi)
API. To bake your own key into release builds (instead of the rate-limited demo key), add a
GitHub Actions secret:

- Name: `EXPO_PUBLIC_OCRSPACE_API_KEY`
- Value: your free key from [ocr.space/ocrapi](https://ocr.space/ocrapi)

This is optional — barcode scanning works without it.

## Notes

- The app is **offline-first**: there is no login or backend. All user data (profile,
  history, pantry, favourites) lives on the device. There are no Supabase or Gemini
  credentials to manage anymore.
- Barcode scanning and label capture use `react-native-vision-camera`, so builds go through
  `expo prebuild` → Gradle (no Expo Go).
