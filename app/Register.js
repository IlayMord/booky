import { Ionicons } from "@expo/vector-icons";
import { Link, useRouter } from "expo-router";
import {
  createUserWithEmailAndPassword,
  updateProfile,
} from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { auth, db } from "../firebaseConfig";

export default function Register() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [role, setRole] = useState("client"); // 🟢 חדש — ברירת מחדל: לקוח
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);

  const validate = () => {
    if (!name.trim()) return "יש להזין שם מלא";
    if (!email.trim()) return "יש להזין אימייל";
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
    if (!emailOk) return "אימייל לא תקין";
    if (pass.length < 6) return "הסיסמה חייבת להיות לפחות 6 תווים";
    if (pass !== pass2) return "הסיסמאות אינן תואמות";
    return null;
  };

  const onRegister = async () => {
    const errMsg = validate();
    if (errMsg) {
      Alert.alert("שגיאה", errMsg);
      return;
    }

    try {
      setLoading(true);

      // 🟢 יצירת משתמש חדש
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), pass);
      await updateProfile(cred.user, { displayName: name.trim() });

      // 🟢 יצירת מסמך משתמש ב־users
      const userRef = doc(db, "users", cred.user.uid);
      await setDoc(userRef, {
        uid: cred.user.uid,
        email: cred.user.email,
        displayName: name.trim(),
        createdAt: serverTimestamp(),
        role,
      });

      // 🟢 אם נרשם כבעל עסק — יצירת עסק בסיסי אוטומטי
      if (role === "business") {
        await setDoc(doc(db, "businesses", cred.user.uid), {
          ownerId: cred.user.uid,
          name: name.trim(),
          category: "",
          phone: "",
          address: "",
          description: "",
          hours: "",
          image: "",
          createdAt: serverTimestamp(),
        });
      }

      Alert.alert("✅ הצלחה", "ההרשמה הושלמה בהצלחה!");
      router.replace(role === "business" ? "/BusinessDashboard" : "/");
    } catch (e) {
      console.error("Register error:", e);
      let msg = "שגיאה בהרשמה";
      if (e.code === "auth/email-already-in-use") msg = "האימייל כבר בשימוש";
      if (e.code === "auth/invalid-email") msg = "אימייל לא תקין";
      if (e.code === "auth/weak-password") msg = "סיסמה חלשה מדי";
      Alert.alert("שגיאה", msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: "#f5f7fa" }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>יצירת חשבון</Text>
        <Text style={styles.subtitle}>בחר סוג חשבון והזן פרטים</Text>

        {/* שם */}
        <View style={styles.inputRow}>
          <Ionicons name="person-outline" size={20} color="#666" />
          <TextInput
            style={styles.input}
            placeholder="שם מלא"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
          />
        </View>

        {/* אימייל */}
        <View style={styles.inputRow}>
          <Ionicons name="mail-outline" size={20} color="#666" />
          <TextInput
            style={styles.input}
            placeholder="אימייל"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
        </View>

        {/* סיסמה */}
        <View style={styles.inputRow}>
          <Ionicons name="lock-closed-outline" size={20} color="#666" />
          <TextInput
            style={styles.input}
            placeholder="סיסמה"
            value={pass}
            onChangeText={setPass}
            secureTextEntry={!showPass}
          />
          <TouchableOpacity onPress={() => setShowPass(!showPass)}>
            <Ionicons
              name={showPass ? "eye-off-outline" : "eye-outline"}
              size={20}
              color="#666"
            />
          </TouchableOpacity>
        </View>

        {/* אימות סיסמה */}
        <View style={styles.inputRow}>
          <Ionicons name="lock-closed-outline" size={20} color="#666" />
          <TextInput
            style={styles.input}
            placeholder="אימות סיסמה"
            value={pass2}
            onChangeText={setPass2}
            secureTextEntry={!showPass}
          />
        </View>

        {/* 🟢 בחירת סוג חשבון */}
        <Text style={styles.roleTitle}>בחר סוג חשבון:</Text>
        <View style={styles.roleContainer}>
          <TouchableOpacity
            style={[styles.roleBtn, role === "client" && styles.roleSelected]}
            onPress={() => setRole("client")}
          >
            <Ionicons name="person-circle-outline" size={22} color="#6C63FF" />
            <Text style={styles.roleText}>לקוח</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.roleBtn, role === "business" && styles.roleSelected]}
            onPress={() => setRole("business")}
          >
            <Ionicons name="briefcase-outline" size={22} color="#6C63FF" />
            <Text style={styles.roleText}>בעל עסק</Text>
          </TouchableOpacity>
        </View>

        {/* כפתור הרשמה */}
        <TouchableOpacity
          style={[styles.btn, loading && { opacity: 0.7 }]}
          onPress={onRegister}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="person-add-outline" size={18} color="#fff" />
              <Text style={styles.btnText}>הרשמה</Text>
            </>
          )}
        </TouchableOpacity>

        {/* לינק לכניסה */}
        <View style={styles.loginRow}>
          <Text style={{ color: "#666" }}>כבר יש לך חשבון?</Text>
          <Link href="/Login" replace style={styles.loginLink}>
            היכנס
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    paddingTop: 60,
    alignItems: "stretch",
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    color: "#333",
  },
  subtitle: {
    color: "#666",
    marginTop: 6,
    marginBottom: 18,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 12,
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 6,
  },
  input: {
    flex: 1,
    marginLeft: 8,
    fontSize: 15,
    color: "#222",
  },
  roleTitle: {
    marginTop: 20,
    fontWeight: "800",
    color: "#333",
    textAlign: "right",
  },
  roleContainer: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    marginTop: 10,
  },
  roleBtn: {
    flex: 1,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f3f3f3",
    borderRadius: 12,
    paddingVertical: 12,
    marginHorizontal: 5,
    gap: 8,
  },
  roleSelected: {
    backgroundColor: "#dcd6ff",
  },
  roleText: { fontWeight: "700", color: "#333" },
  btn: {
    marginTop: 25,
    backgroundColor: "#6C63FF",
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    flexDirection: "row",
    gap: 6,
  },
  btnText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  loginRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 16,
    gap: 6,
  },
  loginLink: { color: "#6C63FF", fontWeight: "700" },
});
