/** @type {import('next').NextConfig} */
const path = require('path');
const { execSync } = require('child_process');

// 执行构建前的数据获取
const prebuildData = () => {
  try {
    console.log('运行预构建脚本获取数据...');
    execSync('node ./src/lib/prebuild.ts', { stdio: 'inherit' });
    console.log('预构建数据获取完成');
  } catch (error) {
    console.error('预构建失败:', error);
    process.exit(1); // 构建时强制退出，确保静态数据必须成功获取
  }
};

const nextConfig = {
  reactStrictMode: true,
  // 生成纯静态站点
  output: 'export',
  // 禁用所有需要服务器组件的功能
  experimental: {
    appDir: true
  },
  // 基本设置
  images: {
    unoptimized: true, // 纯静态导出需要
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com',
        pathname: '**',
      },
    ],
  },
  // 添加webpack配置
  webpack: (config) => {
    config.resolve.alias['@'] = path.resolve(__dirname, 'src');
    // 添加静态导出相关配置
    config.module.rules.push({
      test: /\.(js|jsx|ts|tsx)$/,
      use: [],
      exclude: /node_modules/
    });
    return config;
  },
  // 避免客户端组件在SSG模式下的问题
  compiler: {
    styledComponents: true
  },
  
  // 处理特定文件
  transpilePackages: ['react-syntax-highlighter']
};

// 在导出之前执行预构建
prebuildData();

module.exports = nextConfig;