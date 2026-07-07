/**
 * Instagram Graph API client for publishing quote images.
 *
 * Prerequisites (see docs/instagram-setup.md):
 * 1. Instagram Business/Creator account linked to a Facebook Page
 * 2. Meta App with instagram_basic + instagram_content_publish permissions
 * 3. Long-lived User Access Token with pages_manage_posts
 * 4. IG User ID (from /me/accounts → /{page-id}?fields=instagram_business_account)
 */

const IG_GRAPH_API = "https://graph.facebook.com/v22.0";

interface InstagramConfig {
  accessToken: string;
  igUserId: string;
}

function getConfig(): InstagramConfig {
  const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;
  const igUserId = process.env.INSTAGRAM_IG_USER_ID;

  if (!accessToken || accessToken === "your_instagram_access_token_here") {
    throw new Error(
      "INSTAGRAM_ACCESS_TOKEN is not set. See docs/instagram-setup.md"
    );
  }
  if (!igUserId || igUserId === "your_instagram_ig_user_id_here") {
    throw new Error(
      "INSTAGRAM_IG_USER_ID is not set. See docs/instagram-setup.md"
    );
  }

  return { accessToken, igUserId };
}

/**
 * Step 1: Create a media container (upload the image to Instagram's servers).
 * Returns a container ID that must be used in step 2.
 */
export async function createMediaContainer(
  imageUrl: string,
  caption: string
): Promise<string> {
  const { accessToken, igUserId } = getConfig();

  const url = `${IG_GRAPH_API}/${igUserId}/media`;
  const params = new URLSearchParams({
    image_url: imageUrl,
    caption,
    access_token: accessToken,
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
  containerId: string
): Promise<string> {
  const { accessToken, igUserId } = getConfig();

  const url = `${IG_GRAPH_API}/${igUserId}/media_publish`;
  const params = new URLSearchParams({
    creation_id: containerId,
    access_token: accessToken,
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
 */
export async function publishToInstagram(
  imageUrl: string,
  caption: string
): Promise<{ mediaId: string }> {
  const containerId = await createMediaContainer(imageUrl, caption);

  // Brief delay to let Instagram process the container
  await new Promise((resolve) => setTimeout(resolve, 2000));

  const mediaId = await publishMediaContainer(containerId);
  return { mediaId };
}
