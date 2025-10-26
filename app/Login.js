import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { signInWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { auth, db } from "../firebaseConfig";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // 🟣 התחברות למשתמש עם זיהוי תפקיד
  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert("שגיאה", "אנא מלא את כל השדות");
      return;
    }

    try {
      setLoading(true);

      // התחברות רגילה
      const userCred = await signInWithEmailAndPassword(auth, email, password);

      // שליפת פרטי המשתמש מה-DB
      const ref = doc(db, "users", userCred.user.uid);
      const snap = await getDoc(ref);

      if (snap.exists()) {
        const userData = snap.data();

        // לפי התפקיד – מעביר למסך המתאים
        if (userData.role === "business") {
          router.replace("/BusinessDashboard");
        } else {
          router.replace("/");
        }
      } else {
        // אם לא קיים מסמך ב-DB – שולח ללקוח כברירת מחדל
        router.replace("/");
      }
    } catch (error) {
      console.error(error);
      Alert.alert("שגיאה", "האימייל או הסיסמה אינם נכונים");
    } finally {
      setLoading(false);
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
          {/* כותרת עליונה */}
          <Animated.View entering={FadeInDown.delay(100)} style={styles.headerBox}>
            <Text style={styles.logo}>Booky</Text>
            <Text style={styles.subtitle}>ניהול תורים חכם לעסקים</Text>
          </Animated.View>

          {/* טופס התחברות */}
          <Animated.View entering={FadeInDown.delay(200)} style={styles.formBox}>
            <Text style={styles.label}>אימייל</Text>
            <TextInput
              style={styles.input}
              placeholder="example@email.com"
              placeholderTextColor="#aaa"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <Text style={styles.label}>סיסמה</Text>
            <TextInput
              style={styles.input}
              placeholder="••••••••"
              placeholderTextColor="#aaa"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />

            {/* כפתור שכחתי סיסמה */}
            <TouchableOpacity
              onPress={() => router.push("/ForgotPassword")}
              style={styles.forgotLink}
            >
              <Text style={styles.forgotText}>שכחתי סיסמה?</Text>
            </TouchableOpacity>

            {/* כפתור כניסה */}
            <TouchableOpacity
              style={[styles.loginButton, loading && { opacity: 0.7 }]}
              onPress={handleLogin}
              disabled={loading}
            >
              <LinearGradient
                colors={["#6C63FF", "#48C6EF"]}
                style={styles.loginGradient}
              >
                <Text style={styles.loginText}>
                  {loading ? "מתחבר..." : "כניסה"}
                </Text>
              </LinearGradient>
            </TouchableOpacity>

            {/* קישור להרשמה */}
            <TouchableOpacity
              onPress={() => router.push("/Register")}
              style={styles.registerLink}
            >
              <Text style={styles.registerText}>
                אין לך חשבון? <Text style={styles.registerBold}>הירשם כאן</Text>
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
  forgotLink: {
    marginTop: 10,
    alignSelf: "flex-end",
  },
  forgotText: {
    color: "#6C63FF",
    fontWeight: "700",
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
