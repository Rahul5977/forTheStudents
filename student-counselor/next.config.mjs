/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  // Static export → a plain folder of HTML/JS/CSS in out/. No server needed, so it
  // can be hosted on any CDN (Amplify / S3+CloudFront) for ~$0.
  output: 'export',
  // Directory-style URLs (/predictor/ -> /predictor/index.html) — the pattern every
  // static host serves natively.
  trailingSlash: true,
  // next/image optimization needs a server; disable it for a static export.
  images: { unoptimized: true },
};

export default nextConfig;
