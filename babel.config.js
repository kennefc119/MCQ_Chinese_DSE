module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    // react-native-reanimated/plugin MUST be last — required by @react-navigation/drawer
    plugins: ["react-native-reanimated/plugin"],
  };
};
