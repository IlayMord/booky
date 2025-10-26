import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { auth, db } from "../firebaseConfig";

export default function BusinessProfileEdit() {
  const [business, setBusiness] = useState({
    name: "",
    phone: "",
    address: "",
    category: "",
    description: "",
    hours: "",
    image: "",
    autoApprove: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const fetchBusiness = async () => {
      try {
        const user = auth.currentUser;
        if (!user) return;
        const ref = doc(db, "businesses", user.uid);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          setBusiness({ autoApprove: false, ...snap.data() });
        }
      } catch (err) {
        console.error("שגיאה בשליפת נתוני עסק:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchBusiness();
  }, []);

  const handlePickImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("שגיאה", "יש לאשר גישה לגלריה");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });

    if (!result.canceled) {
      setBusiness({ ...business, image: result.assets[0].uri });
    }
  };

  const handleSave = async () => {
    const user = auth.currentUser;
    if (!user) return Alert.alert("שגיאה", "אין משתמש מחובר");
    if (!business.name.trim()) return Alert.alert("שגיאה", "יש להזין שם עסק");

    try {
      setSaving(true);
      await setDoc(
        doc(db, "businesses", user.uid),
        {
          ...business,
          ownerId: user.uid,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      Alert.alert("✅ עודכן", "פרטי העסק נשמרו בהצלחה");
      router.replace("/BusinessDashboard");
    } catch (err) {
      console.error(err);
      Alert.alert("שגיאה", "שמירת הפרטים נכשלה");
    } finally {
      setSaving(false);
    }
  };

  if (loading)
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#6C63FF" />
        <Text>טוען נתוני עסק...</Text>
      </View>
    );

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.header}>עריכת פרופיל עסקי</Text>

      {/* תמונת לוגו */}
      <TouchableOpacity onPress={handlePickImage} style={styles.imagePicker}>
        {business.image ? (
          <Image source={{ uri: business.image }} style={styles.image} />
        ) : (
          <Ionicons name="camera-outline" size={50} color="#aaa" />
        )}
      </TouchableOpacity>
      <Text style={styles.imageLabel}>לחץ להחלפת לוגו</Text>

      {/* שדות עסק */}
      <TextInput
        style={styles.input}
        placeholder="שם העסק"
        value={business.name}
        onChangeText={(v) => setBusiness({ ...business, name: v })}
      />
      <TextInput
        style={styles.input}
        placeholder="טלפון"
        keyboardType="phone-pad"
        value={business.phone}
        onChangeText={(v) => setBusiness({ ...business, phone: v })}
      />
      <TextInput
        style={styles.input}
        placeholder="כתובת"
        value={business.address}
        onChangeText={(v) => setBusiness({ ...business, address: v })}
      />
      <TextInput
        style={styles.input}
        placeholder="קטגוריה (מספרה, רפואה, סטודיו...)"
        value={business.category}
        onChangeText={(v) => setBusiness({ ...business, category: v })}
      />
      <TextInput
        style={[styles.input, { height: 80 }]}
        placeholder="תיאור קצר על העסק"
        multiline
        value={business.description}
        onChangeText={(v) => setBusiness({ ...business, description: v })}
      />
      <TextInput
        style={styles.input}
        placeholder="שעות פעילות (לדוגמה: א'-ה' 9:00–18:00)"
        value={business.hours}
        onChangeText={(v) => setBusiness({ ...business, hours: v })}
      />

      {/* 🟢 אישור אוטומטי */}
      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>אשר תורים אוטומטית</Text>
        <Switch
          value={business.autoApprove}
          onValueChange={(v) => setBusiness({ ...business, autoApprove: v })}
          trackColor={{ false: "#ccc", true: "#6C63FF" }}
          thumbColor={business.autoApprove ? "#fff" : "#888"}
        />
      </View>

      {/* שמירה */}
      <TouchableOpacity
        style={[styles.saveBtn, saving && { opacity: 0.7 }]}
        onPress={handleSave}
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.saveText}>💾 שמור שינויים</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.cancelBtn}
        onPress={() => router.replace("/BusinessDashboard")}
      >
        <Text style={styles.cancelText}>ביטול וחזרה</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: "#f5f7fa",
    flexGrow: 1,
  },
  header: {
    fontSize: 24,
    fontWeight: "800",
    textAlign: "right",
    color: "#333",
    marginBottom: 20,
  },
  imagePicker: {
    alignSelf: "center",
    backgroundColor: "#eee",
    borderRadius: 100,
    width: 120,
    height: 120,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  image: { width: 120, height: 120, borderRadius: 100 },
  imageLabel: {
    textAlign: "center",
    marginVertical: 10,
    color: "#777",
  },
  input: {
    backgroundColor: "#fff",
    borderRadius: 15,
    padding: 12,
    fontSize: 16,
    color: "#333",
    marginTop: 12,
    textAlign: "right",
  },
  switchRow: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 20,
    backgroundColor: "#fff",
    padding: 12,
    borderRadius: 15,
  },
  switchLabel: { color: "#333", fontWeight: "700", fontSize: 16 },
  saveBtn: {
    backgroundColor: "#6C63FF",
    paddingVertical: 15,
    borderRadius: 15,
    marginTop: 25,
    alignItems: "center",
  },
  saveText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  cancelBtn: { marginTop: 15, alignItems: "center" },
  cancelText: { color: "#666", fontWeight: "700" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
});
