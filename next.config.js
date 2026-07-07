/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow larger response bodies for image data
  experimental: {
    serverActions: {
      bodySizeLimit: "20mb",
    },
  },
};

module.exports = nextConfig;
