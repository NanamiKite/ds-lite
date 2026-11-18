// ESLint 平面配置：Expo 官方预设（React Native / Expo Router 友好）
const expoConfig = require('eslint-config-expo/flat');

module.exports = [
  ...expoConfig,
  {
    ignores: ['.test-dist/**', 'node_modules/**', '.expo/**'],
  },
];
