import { Redirect, useRootNavigationState } from "expo-router";
import { ActivityIndicator, View } from "react-native";

export default function Index() {
  const rootNavigation = useRootNavigationState();

  if (!rootNavigation?.key) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#f5f7fa",
        }}
      >
        <ActivityIndicator size="large" color="#6C63FF" />
      </View>
    );
  }

  return <Redirect href="/HomeClient" />;
}
