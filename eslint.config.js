// ESLint 平面配置：Expo 官方预设（React Native / Expo Router 友好）
const expoConfig = require('eslint-config-expo/flat');

module.exports = [
  ...expoConfig,
  {
    ignores: ['.test-dist/**', 'node_modules/**', '.expo/**'],
  },
  {
    rules: {
      // 外部 store 快照同步到本地 state（tick 驱动 reload / 持久化水合门）
      // 是本项目的既定模式，同步 setState 属预期行为，降为提示
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
];
