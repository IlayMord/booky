const { getDefaultConfig } = require("expo/metro-config");
const fs = require("fs");
const path = require("path");

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);

const notificationsModulePath = path.join(
  projectRoot,
  "node_modules",
  "expo-notifications"
);

if (!fs.existsSync(notificationsModulePath)) {
  config.resolver = config.resolver || {};
  config.resolver.extraNodeModules = {
    ...(config.resolver.extraNodeModules || {}),
    "expo-notifications": path.join(projectRoot, "shims", "expo-notifications.js"),
  };
}

module.exports = config;
