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
 * When Instagram API is not configured (restricted), falls back to local
 * simulation: copies the image + caption to output/published/ for manual posting.
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
  let config: PublishConfig;
  try {
    config = resolvePublishConfig(accountId);
  } catch {
    // Instagram not configured — simulate local publish
    return simulateLocalPublish(imageUrl, caption, accountId);
  }

  const containerId = await createMediaContainer(imageUrl, caption, config);

  // Brief delay to let Instagram process the container
  await new Promise((resolve) => setTimeout(resolve, 2000));

  const mediaId = await publishMediaContainer(containerId, config);
  return { mediaId };
}

/**
 * Simulate Instagram publish locally when the API is unavailable.
 * Copies the image to output/published/ and writes a caption file,
 * so the user can manually post.
 */
async function simulateLocalPublish(
  imageUrl: string,
  caption: string,
  accountId?: string
): Promise<{ mediaId: string }> {
  const fs = await import("fs");
  const path = await import("path");

  const publishedRoot = path.resolve(process.cwd(), "output", "published");
  const publishedDir = accountId
    ? path.join(publishedRoot, accountId)
    : publishedRoot;

  if (!fs.existsSync(publishedDir)) {
    fs.mkdirSync(publishedDir, { recursive: true });
  }

  // Extract filename from the URL
  const urlParts = imageUrl.split("/");
  const filename = urlParts[urlParts.length - 1] || `image-${Date.now()}.png`;
  const baseName = path.basename(filename, path.extname(filename));
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

  const publishedImage = `${timestamp}-${filename}`;
  const publishedCaption = `${timestamp}-${baseName}-caption.txt`;

  // Try to download the image from the URL (it's a local dev server URL)
  try {
    const res = await fetch(imageUrl);
    if (res.ok) {
      const buffer = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(path.join(publishedDir, publishedImage), buffer);
    }
  } catch {
    // Image fetch failed — skip image copy, caption is still useful
  }

  // Write caption file
  fs.writeFileSync(
    path.join(publishedDir, publishedCaption),
    `📅 Published: ${new Date().toLocaleString()}\n${accountId ? `📱 Account: ${accountId}\n` : ""}${"─".repeat(40)}\n\n${caption}\n\n${"─".repeat(40)}\n📎 Image: ${publishedImage}\n`,
    "utf-8"
  );

  const mediaId = `sim_${Date.now()}`;

  const { createLogger } = await import("./logger");
  const log = createLogger("instagram");
  log.info(
    { account: accountId, image: publishedImage, caption: publishedCaption, dir: publishedDir },
    "📦 Local publish simulation — image saved for manual posting. Configure Instagram API to publish for real."
  );

  return { mediaId };
}
