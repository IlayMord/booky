import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { sendPasswordResetEmail } from "firebase/auth";
import { useState } from "react";
import {
    Alert,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { auth } from "../firebaseConfig";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const router = useRouter();

  const handleResetPassword = async () => {
    if (!email) {
      Alert.alert("שגיאה", "אנא הזן אימייל תקין");
      return;
    }

    try {
      await sendPasswordResetEmail(auth, email);
      Alert.alert(
        "קישור נשלח 📩",
        "שלחנו אליך קישור לאיפוס הסיסמה. בדוק את תיבת הדואר שלך."
      );
      router.replace("/Login");
    } catch (error) {
      console.error("Password reset error:", error);
      Alert.alert("שגיאה", "לא הצלחנו לשלוח מייל, בדוק את הכתובת.");
    }
  };

  return (
    <LinearGradient colors={["#6C63FF", "#48C6EF"]} style={styles.gradient}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View entering={FadeInDown.delay(100)} style={styles.headerBox}>
            <Text style={styles.logo}>Booky</Text>
            <Text style={styles.subtitle}>איפוס סיסמה</Text>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(200)} style={styles.formBox}>
            <Text style={styles.label}>אימייל</Text>
            <TextInput
              style={styles.input}
              placeholder="your@email.com"
              placeholderTextColor="#aaa"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <TouchableOpacity
              style={styles.loginButton}
              onPress={handleResetPassword}
            >
              <LinearGradient
                colors={["#6C63FF", "#48C6EF"]}
                style={styles.loginGradient}
              >
                <Text style={styles.loginText}>שלח קישור לאיפוס</Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.push("/Login")}
              style={styles.registerLink}
            >
              <Text style={styles.registerText}>
                נזכרת בסיסמה? <Text style={styles.registerBold}>התחבר כאן</Text>
              </Text>
            </TouchableOpacity>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  container: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 30,
    paddingVertical: 60,
  },
  headerBox: { alignItems: "center", marginBottom: 50 },
  logo: {
    fontSize: 48,
    fontWeight: "900",
    color: "#fff",
    letterSpacing: 1,
  },
  subtitle: {
    fontSize: 16,
    color: "#e8e8e8",
    marginTop: 6,
  },
  formBox: {
    width: "100%",
    backgroundColor: "#fff",
    borderRadius: 25,
    padding: 25,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 10,
  },
  label: {
    fontSize: 14,
    fontWeight: "700",
    color: "#3e3e63",
    marginBottom: 5,
    marginTop: 10,
  },
  input: {
    backgroundColor: "#f5f5f5",
    borderRadius: 15,
    paddingHorizontal: 15,
    paddingVertical: 12,
    fontSize: 15,
    color: "#333",
  },
  loginButton: { marginTop: 25, alignItems: "center" },
  loginGradient: {
    width: "100%",
    borderRadius: 20,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#6C63FF",
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  loginText: { color: "#fff", fontSize: 17, fontWeight: "800" },
  registerLink: { marginTop: 20, alignItems: "center" },
  registerText: { color: "#3e3e63", fontSize: 14 },
  registerBold: { color: "#6C63FF", fontWeight: "800" },
});
