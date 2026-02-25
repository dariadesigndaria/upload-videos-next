/** @type {import('next').NextConfig} */
const repository = process.env.GITHUB_REPOSITORY ?? '';
const repoName = repository.split('/')[1] ?? '';
const isUserOrOrgPagesRepo = repoName.toLowerCase().endsWith('.github.io');
const basePath = repoName && !isUserOrOrgPagesRepo ? `/${repoName}` : '';

const nextConfig = {
  transpilePackages: ['@yachtway/design-system'],
  output: 'export',
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
  basePath,
  assetPrefix: basePath || undefined,
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
};

export default nextConfig;
