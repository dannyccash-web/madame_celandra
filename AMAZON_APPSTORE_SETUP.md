# Madame Celandra — Amazon Appstore Setup
## Everything done in a browser. No Terminal. No Android device needed.

---

## Step 1: Create an Amazon Developer Account
**Free. ~5 minutes.**

1. Go to https://developer.amazon.com
2. Click **"Sign in"** — use your regular Amazon account
3. Accept the developer agreement
4. No registration fee

---

## Step 2: Connect Your GitHub Repo to Codemagic
**Codemagic builds the app in the cloud so you never need Android Studio.**

1. Go to https://codemagic.io/signup and sign up with GitHub
2. Click **"Add application"**
3. Select **GitHub** → choose **madame_celandra**
4. When asked for project type, select **"Other"** → **"YAML configuration"**
   *(The repo already has codemagic.yaml — Codemagic will find it automatically)*

---

## Step 3: Set Up App Signing in Codemagic
**Codemagic generates and holds your signing key securely.**

1. In Codemagic, open your app → go to **"Code signing identities"** (left sidebar)
2. Under **Android keystores**, click **"Generate keystore"**
3. Fill in:
   - Keystore name: `madame_celandra_keystore`
   - Key alias: `madame_celandra`
   - Password: anything you'll remember
   - Validity: `25` years
4. Click **Generate** — Codemagic stores it, you never need to touch it again

---

## Step 4: Build the APK
**~15 minutes. Codemagic does all the work.**

1. In Codemagic, go to your app → click **"Start new build"**
2. Select workflow: **"Android APK (Amazon Appstore)"**
3. Click **Start build**
4. When it finishes (green checkmark), click **"Download artifacts"**
5. Save the file: `app-release.apk`

---

## Step 5: Create the App in Amazon Developer Console
**~10 minutes.**

1. Go to https://developer.amazon.com/apps-and-games
2. Click **"Add a New App"** → **Android**
3. App title: **Madame Celandra**
4. Category: **Entertainment**
5. Click **Save**

---

## Step 6: Upload Your APK
1. In your app dashboard, click **"Binary File(s)"**
2. Click **"Upload your APK"**
3. Select the `app-release.apk` file you downloaded from Codemagic
4. Amazon will scan it — takes a couple minutes
5. Click **Save**

---

## Step 7: Fill In the Store Listing

**Description tab:**
- Short description (1200 chars max): describe the app
- Long description: full pitch — I can write both of these for you

**Images & Multimedia tab:**
- App icon: **512×512 PNG** — use `icon-512.png` from your project folder
- Screenshots: at least 3 phone screenshots (I can help capture these)
- A "promotional image" (1024×500) is optional but recommended — I can design one

**Content Rating tab:**
- Fill out the questionnaire — takes ~5 minutes
- Select **17+** (mature themes)
- Add disclaimer: "For entertainment purposes only"

**Pricing tab:**
- Set to **Paid**
- Price: **$4.99**
- Amazon automatically handles international pricing

---

## Step 8: Submit for Review
1. Click **"Submit App"**
2. Amazon reviews take **1–3 business days**
3. You'll get an email when it's approved

---

## After Launch: Updating the App

Whenever I update the code:
1. I push to GitHub
2. You trigger a new build in Codemagic (one click)
3. Download the new APK
4. Upload it in Amazon Developer Console → **"Add upcoming version"**

That's it.
