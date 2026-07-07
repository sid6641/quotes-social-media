# Instagram Publishing Setup

To publish images directly to Instagram from the review page, you need to:

1. Convert your Instagram account to a **Business or Creator** account
2. Link it to a **Facebook Page**
3. Create a **Meta App** with the Instagram Graph API
4. Get a **long-lived access token**
5. Find your **Instagram Business Account ID**

---

## Step 1: Instagram Account Type

Ensure your Instagram account is a **Creator** or **Business** account:

1. Open Instagram app → Settings → Account → Switch to Professional
2. Choose **Creator** (recommended for individuals) or **Business**
3. Connect it to an existing Facebook Page (create one if needed)

> **Why?** Only Creator/Business accounts can use the Instagram Graph API for publishing.

---

## Step 2: Create a Meta App

1. Go to [Meta for Developers](https://developers.facebook.com/apps/)
2. Click **Create App**
3. Choose **Business** as the app type
4. Fill in the details (name, contact email)
5. Once created, go to **Dashboard** → **Add Product** → **Instagram Graph API**

---

## Step 3: Get Permissions

The app needs these permissions:
- `instagram_basic` — read access to your Instagram account
- `instagram_content_publish` — publish content to Instagram
- `pages_manage_posts` — manage posts on your linked Facebook Page
- `pages_read_engagement` — read your Facebook Page info

**For development/testing:**
1. Go to your app's **App Review** → **Permissions and Features**
2. Request `instagram_basic`, `instagram_content_publish`
3. For testing, you can use **App Roles** → **Test Users** to create a test user
4. Or use the **Graph API Explorer** with your own account (tokens work for 2 hours without app review)

**For production (required for long-lived tokens):**
- Submit your app for **Meta App Review**
- Provide a demo video showing how the publishing feature works
- This can take a few days to a week

---

## Step 4: Get a Short-Lived Access Token (Dev Mode)

Use the **Graph API Explorer** for quick testing:

1. Go to [Graph API Explorer](https://developers.facebook.com/tools/explorer/)
2. Select your app
3. Select **User Token** → add permissions:
   - `instagram_basic`
   - `instagram_content_publish`
   - `pages_manage_posts`
   - `pages_read_engagement`
4. Click **Generate Access Token** and authorize
5. Copy the token (expires in ~2 hours for dev mode)

---

## Step 5: Exchange for a Long-Lived Token (60 days)

Long-lived tokens last 60 days and can be refreshed:

```
GET https://graph.facebook.com/v22.0/oauth/access_token
  ?grant_type=fb_exchange_token
  &client_id={YOUR_APP_ID}
  &client_secret={YOUR_APP_SECRET}
  &fb_exchange_token={SHORT_LIVED_TOKEN}
```

Save the returned `access_token` — this is your long-lived token.

---

## Step 6: Find Your Facebook Page ID

```
GET https://graph.facebook.com/v22.0/me/accounts?access_token={LONG_LIVED_TOKEN}
```

Find your Facebook Page in the response and note its `id`.

---

## Step 7: Find Your Instagram Business Account ID

```
GET https://graph.facebook.com/v22.0/{FACEBOOK_PAGE_ID}?fields=instagram_business_account&access_token={LONG_LIVED_TOKEN}
```

The response contains `instagram_business_account.id` — this is your **IG User ID**.

---

## Step 8: Configure the App

Add to your `.env`:

```env
INSTAGRAM_ACCESS_TOKEN=your_long_lived_token_here
INSTAGRAM_IG_USER_ID=your_ig_user_id_here
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

---

## Step 9: Publish

1. Generate and approve images on the review page
2. Click **Publish to Instagram**
3. The app creates a media container → publishes it → your image goes live

---

## Troubleshooting

| Error | Likely Cause |
|-------|-------------|
| `(#100) Media ID is invalid` | Image URL isn't publicly accessible |
| `(#200) Requires app review` | App hasn't been submitted for review |
| `(#10) Application request limit reached` | API rate limit hit (max ~25 posts/day) |
| `(#220702) User doesn't have a valid Instagram account` | Account isn't Business/Creator type |
| Token expired | Regenerate via the Graph API Explorer |

## Token Refresh

Long-lived tokens expire after 60 days. Refresh before expiry:

```
GET https://graph.facebook.com/v22.0/oauth/access_token
  ?grant_type=fb_exchange_token
  &client_id={APP_ID}
  &client_secret={APP_SECRET}
  &fb_exchange_token={CURRENT_TOKEN}
```
