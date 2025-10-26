import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { signOut, updateEmail, updatePassword } from "firebase/auth";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import {
    getDownloadURL,
    getStorage,
    ref,
    uploadBytes,
} from "firebase/storage";
import { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Image,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import Animated, { FadeInUp } from "react-native-reanimated";
import { auth, db } from "../firebaseConfig";

export default function Profile() {
  const [userData, setUserData] = useState({});
  const [editing, setEditing] = useState(false);
  const [passwordMode, setPasswordMode] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const router = useRouter();
  const storage = getStorage();

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const user = auth.currentUser;
        if (user) {
          const ref = doc(db, "users", user.uid);
          const snap = await getDoc(ref);
          if (snap.exists()) setUserData(snap.data());
          else setUserData({ email: user.email });
        }
      } catch (error) {
        console.error("Error fetching user:", error);
      }
      setLoading(false);
    };
    fetchUser();
  }, []);

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled) {
      const uri = result.assets[0].uri;
      await uploadImageToStorage(uri);
    }
  };

  const uploadImageToStorage = async (uri) => {
    try {
      setUploading(true);
      const user = auth.currentUser;
      const response = await fetch(uri);
      const blob = await response.blob();
      const imageRef = ref(storage, `profilePictures/${user.uid}.jpg`);
      await uploadBytes(imageRef, blob);
      const downloadURL = await getDownloadURL(imageRef);
      setUserData((prev) => ({ ...prev, avatar: downloadURL }));
      await updateDoc(doc(db, "users", user.uid), { avatar: downloadURL });
      Alert.alert("✅ תמונה עודכנה בהצלחה");
    } catch (error) {
      Alert.alert("שגיאה בהעלאת תמונה", error.message);
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    try {
      const user = auth.currentUser;
      const ref = doc(db, "users", user.uid);
      await updateDoc(ref, userData);

      if (userData.email && userData.email !== user.email) {
        await updateEmail(user, userData.email);
      }

      Alert.alert("✅ עודכן בהצלחה", "הפרטים נשמרו במערכת");
      setEditing(false);
    } catch (error) {
      Alert.alert("שגיאה", error.message);
    }
  };

  const handlePasswordChange = async () => {
    if (!newPassword || newPassword.length < 6) {
      Alert.alert("שגיאה", "הסיסמה חייבת להכיל לפחות 6 תווים");
      return;
    }
    try {
      await updatePassword(auth.currentUser, newPassword);
      Alert.alert("✅ עודכן בהצלחה", "הסיסמה שלך שונתה");
      setPasswordMode(false);
      setNewPassword("");
    } catch (error) {
      Alert.alert("שגיאה", error.message);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    router.replace("/Login");
  };

  if (loading)
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#6C63FF" />
        <Text style={styles.loadingText}>טוען פרופיל...</Text>
      </View>
    );

  return (
    <LinearGradient colors={["#6C63FF", "#48C6EF"]} style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        {/* 🔹 Back Button */}
        <TouchableOpacity style={styles.backBtn} onPress={() => router.replace("/")}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>

        {/* 🔹 Profile Header */}
        <Animated.View entering={FadeInUp.delay(200)} style={styles.profileHeader}>
          <TouchableOpacity onPress={pickImage}>
            {uploading ? (
              <ActivityIndicator color="#fff" size="large" />
            ) : (
              <Image
                source={{
                  uri:
                    userData.avatar ||
                    "https://cdn-icons-png.flaticon.com/512/3135/3135715.png",
                }}
                style={styles.avatar}
              />
            )}
          </TouchableOpacity>
          <Text style={styles.name}>{userData.fullName || "משתמש חדש"}</Text>
          <Text style={styles.email}>
            {userData.email || auth.currentUser.email}
          </Text>
        </Animated.View>

        {/* 🔹 Cards Area */}
        <View style={styles.contentArea}>
          {/* Edit personal info */}
          <TouchableOpacity
            style={styles.card}
            onPress={() => {
              setEditing((prev) => !prev);
              setPasswordMode(false);
            }}
          >
            <Image
              source={{ uri: "https://cdn-icons-png.flaticon.com/512/1159/1159633.png" }}
              style={styles.icon}
            />
            <Text style={styles.cardText}>ערוך פרטים אישיים</Text>
          </TouchableOpacity>

          {editing && (
            <View style={styles.editBox}>
              <TextInput
                style={[styles.input, styles.rtl]}
                placeholder="שם מלא"
                placeholderTextColor="#777"
                value={userData.fullName}
                onChangeText={(text) => setUserData({ ...userData, fullName: text })}
                textAlign="right"
              />
              <TextInput
                style={[styles.input, styles.rtl]}
                placeholder="טלפון"
                placeholderTextColor="#777"
                keyboardType="phone-pad"
                value={userData.phone}
                onChangeText={(text) => setUserData({ ...userData, phone: text })}
                textAlign="right"
              />
              <TextInput
                style={[styles.input, styles.rtl]}
                placeholder="אימייל"
                placeholderTextColor="#777"
                keyboardType="email-address"
                value={userData.email}
                onChangeText={(text) => setUserData({ ...userData, email: text })}
                textAlign="right"
              />
              <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
                <Text style={styles.saveText}>שמור</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Change password */}
          <TouchableOpacity
            style={styles.card}
            onPress={() => {
              setPasswordMode((p) => !p);
              setEditing(false);
            }}
          >
            <Image
              source={{ uri: "https://cdn-icons-png.flaticon.com/512/3064/3064197.png" }}
              style={styles.icon}
            />
            <Text style={styles.cardText}>שנה סיסמה</Text>
          </TouchableOpacity>

          {passwordMode && (
            <View style={styles.editBox}>
              <TextInput
                style={[styles.input, styles.rtl]}
                placeholder="הקלד סיסמה חדשה"
                placeholderTextColor="#555"
                secureTextEntry
                value={newPassword}
                onChangeText={setNewPassword}
                textAlign="right"
              />
              <TouchableOpacity style={styles.saveBtn} onPress={handlePasswordChange}>
                <Text style={styles.saveText}>עדכן סיסמה</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* My bookings */}
          <TouchableOpacity style={styles.card} onPress={() => router.push("/MyBookings")}>
            <Image
              source={{ uri: "https://cdn-icons-png.flaticon.com/512/747/747310.png" }}
              style={styles.icon}
            />
            <Text style={styles.cardText}>הצג את התורים שלי</Text>
          </TouchableOpacity>

          {/* Logout */}
          <TouchableOpacity style={styles.logoutCard} onPress={handleLogout}>
            <Image
              source={{ uri: "https://cdn-icons-png.flaticon.com/512/1828/1828490.png" }}
              style={[styles.icon, { tintColor: "#e74c3c" }]}
            />
            <Text style={[styles.cardText, { color: "#e74c3c" }]}>התנתק</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  rtl: {
    textAlign: "right",
    writingDirection: "rtl",
  },
  container: { padding: 20, paddingBottom: 100 },
  backBtn: { marginTop: 50 },
  backArrow: { fontSize: 26, color: "#fff", fontWeight: "bold" },
  profileHeader: { alignItems: "center", marginVertical: 20 },
  avatar: {
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 3,
    borderColor: "#fff",
    backgroundColor: "#fff",
  },
  name: {
    fontSize: 22,
    fontWeight: "900",
    color: "#fff",
    marginTop: 10,
    textAlign: "center",
  },
  email: {
    fontSize: 14,
    color: "#f0f0f0",
    marginTop: 3,
    textAlign: "center",
  },
  contentArea: {
    backgroundColor: "#fff",
    borderRadius: 30,
    paddingVertical: 25,
    paddingHorizontal: 20,
    marginTop: 10,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 6,
  },
  card: {
    flexDirection: "row-reverse",
    alignItems: "center",
    borderRadius: 18,
    padding: 15,
    marginBottom: 12,
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 3,
  },
  icon: { width: 25, height: 25, marginLeft: 12, tintColor: "#6C63FF" },
  cardText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#3e3e63",
    textAlign: "right",
    flex: 1,
  },
  editBox: {
    backgroundColor: "#f9f9f9",
    borderRadius: 15,
    padding: 15,
    marginBottom: 15,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    padding: 10,
    marginVertical: 5,
    color: "#333",
    fontSize: 15,
  },
  saveBtn: {
    backgroundColor: "#6C63FF",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 8,
  },
  saveText: { color: "#fff", fontWeight: "700" },
  logoutCard: {
    flexDirection: "row-reverse",
    alignItems: "center",
    borderRadius: 18,
    padding: 15,
    marginTop: 12,
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 3,
  },
  loading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f5f7fa",
  },
  loadingText: { marginTop: 10, color: "#3e3e63" },
});
