import { useRootNavigationState, useRouter } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";

export default function Index() {
  const router = useRouter();
  const rootNavigation = useRootNavigationState(); // נבדוק שה־layout מוכן

  useEffect(() => {
    // מחכה שה־Root Layout ייטען לפני הניווט
    if (!rootNavigation?.key) return;

    // מפנה אוטומטית למסך הבית של הלקוחות
    router.replace("/HomeClient");
  }, [router, rootNavigation?.key]);

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
