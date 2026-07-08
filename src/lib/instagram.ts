/**
 * Instagram Graph API client for publishing quote images.
 *
 * Supports both global env-var config AND per-account Instagram auth
 * from the accounts config (src/lib/account.ts).
 *
 * Prerequisites (see docs/instagram-setup.md):
 * 1. Instagram Business/Creator account linked to a Facebook Page
 * 2. Meta App with instagram_basic + instagram_content_publish permissions
 * 3. Long-lived User Access Token with pages_manage_posts
 * 4. IG User ID (from /me/accounts → /{page-id}?fields=instagram_business_account)
 */

import { getAccount } from "./account";

const IG_GRAPH_API = "https://graph.facebook.com/v22.0";

export interface PublishConfig {
  accessToken: string;
  igUserId: string;
}

/**
 * Resolve Instagram auth config.
 * Priority: per-account config > global env vars.
 * Throws if no valid config is found.
 */
export function resolvePublishConfig(accountId?: string): PublishConfig {
  // Try per-account Instagram auth first
  if (accountId) {
    const account = getAccount(accountId);
    if (account?.instagram?.accessToken && account?.instagram?.igUserId) {
      return {
        accessToken: account.instagram.accessToken,
        igUserId: account.instagram.igUserId,
      };
    }
  }

  // Fall back to global env vars
  const envToken = process.env.INSTAGRAM_ACCESS_TOKEN;
  const envUserId = process.env.INSTAGRAM_IG_USER_ID;

  if (envToken && envUserId && envToken !== "your_instagram_access_token_here" && envUserId !== "your_instagram_ig_user_id_here") {
    return { accessToken: envToken, igUserId: envUserId };
  }

  const scope = accountId ? `account "${accountId}"` : "global env";
  throw new Error(
    `Instagram API not configured for ${scope}. ` +
    "Set INSTAGRAM_ACCESS_TOKEN + INSTAGRAM_IG_USER_ID in .env, " +
    "or configure instagram.igUserId + instagram.accessToken in the account settings modal."
  );
}

/**
 * Step 1: Create a media container (upload the image to Instagram's servers).
 * Returns a container ID that must be used in step 2.
 */
export async function createMediaContainer(
  imageUrl: string,
  caption: string,
  config: PublishConfig
): Promise<string> {
  const url = `${IG_GRAPH_API}/${config.igUserId}/media`;
  const params = new URLSearchParams({
    image_url: imageUrl,
    caption,
    access_token: config.accessToken,
  });

  const res = await fetch(url, {
    method: "POST",
    body: params,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(
      `Instagram media creation failed: ${data.error?.message || JSON.stringify(data)}`
    );
  }

  return data.id;
}

/**
 * Step 2: Publish a media container that was created in step 1.
 */
export async function publishMediaContainer(
  containerId: string,
  config: PublishConfig
): Promise<string> {
  const url = `${IG_GRAPH_API}/${config.igUserId}/media_publish`;
  const params = new URLSearchParams({
    creation_id: containerId,
    access_token: config.accessToken,
  });

  const res = await fetch(url, {
    method: "POST",
    body: params,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(
      `Instagram publish failed: ${data.error?.message || JSON.stringify(data)}`
    );
  }

  return data.id;
}

/**
 * Publish an image to Instagram in one call (creates container + publishes).
 * The image must be publicly accessible via a URL.
 *
 * @param imageUrl - Publicly accessible URL of the image
 * @param caption - Caption text (with hashtags)
 * @param accountId - Optional account ID (for per-account Instagram auth)
 */
export async function publishToInstagram(
  imageUrl: string,
  caption: string,
  accountId?: string
): Promise<{ mediaId: string }> {
  const config = resolvePublishConfig(accountId);

  const containerId = await createMediaContainer(imageUrl, caption, config);

  // Brief delay to let Instagram process the container
  await new Promise((resolve) => setTimeout(resolve, 2000));

  const mediaId = await publishMediaContainer(containerId, config);
  return { mediaId };
}
