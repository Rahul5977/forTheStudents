/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // No ESLint config is shipped; don't block the build on lint.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
