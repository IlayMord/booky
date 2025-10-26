import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
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
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { auth, db } from "../firebaseConfig";

const HOURS_OPTIONS = [
  "08:00",
  "09:00",
  "10:00",
  "11:00",
  "12:00",
  "13:00",
  "14:00",
  "15:00",
  "16:00",
  "17:00",
  "18:00",
  "19:00",
  "20:00",
];

const timeToMinutes = (time) => {
  if (!/^\d{2}:\d{2}$/.test(time)) return NaN;
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
};

const formatHoursRange = (from, to) =>
  from && to ? `${from} – ${to}` : "";

export default function BusinessProfileEdit() {
  const [business, setBusiness] = useState({
    name: "",
    phone: "",
    address: "",
    category: "",
    description: "",
    hours: "",
    openingHour: "",
    closingHour: "",
    image: "",
    autoApprove: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    const fetchBusiness = async () => {
      try {
        const user = auth.currentUser;
        if (!user) return;
        const ref = doc(db, "businesses", user.uid);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const data = snap.data();
          let openingHour = data.openingHour || "";
          let closingHour = data.closingHour || "";

          if ((!openingHour || !closingHour) && typeof data.hours === "string") {
            const match = data.hours.match(/(\d{2}:\d{2}).*?(\d{2}:\d{2})/);
            if (match) {
              openingHour = openingHour || match[1];
              closingHour = closingHour || match[2];
            }
          }

          setBusiness((prev) => ({
            ...prev,
            ...data,
            openingHour,
            closingHour,
            autoApprove: data.autoApprove ?? false,
          }));
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

    const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (!timeRegex.test(business.openingHour) || !timeRegex.test(business.closingHour)) {
      return Alert.alert("שגיאה", "יש להזין שעות פעילות בפורמט תקין (לדוגמה 09:00)");
    }

    const openMinutes = timeToMinutes(business.openingHour);
    const closeMinutes = timeToMinutes(business.closingHour);

    if (!(openMinutes < closeMinutes)) {
      return Alert.alert("שגיאה", "שעת הסגירה חייבת להיות מאוחרת משעת הפתיחה");
    }

    try {
      setSaving(true);
      const payload = {
        name: business.name,
        phone: business.phone,
        address: business.address,
        category: business.category,
        description: business.description,
        hours: formatHoursRange(business.openingHour, business.closingHour),
        openingHour: business.openingHour,
        closingHour: business.closingHour,
        image: business.image,
        autoApprove: business.autoApprove,
        ownerId: user.uid,
        updatedAt: serverTimestamp(),
      };

      await setDoc(
        doc(db, "businesses", user.uid),
        payload,
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

  const formattedHours = useMemo(
    () => formatHoursRange(business.openingHour, business.closingHour),
    [business.openingHour, business.closingHour]
  );

  if (loading)
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#6C63FF" />
        <Text>טוען נתוני עסק...</Text>
      </View>
    );

  return (
    <SafeAreaView
      style={[
        styles.safeArea,
        { paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 16) },
      ]}
    >
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

      <View style={styles.hoursSection}>
        <Text style={styles.hoursTitle}>שעות פעילות</Text>
        {formattedHours ? (
          <Text style={styles.hoursSubtitle}>{formattedHours}</Text>
        ) : (
          <Text style={styles.hoursSubtitle}>בחרו שעת פתיחה וסגירה</Text>
        )}

        <View style={styles.hoursPickerBlock}>
          <Text style={styles.hoursPickerLabel}>שעת פתיחה</Text>
          <View style={styles.hoursOptionsRow}>
            {HOURS_OPTIONS.map((option) => {
              const selected = option === business.openingHour;
              return (
                <TouchableOpacity
                  key={`open-${option}`}
                  onPress={() => setBusiness({ ...business, openingHour: option })}
                  style={[styles.hourChip, selected && styles.hourChipSelected]}
                >
                  <Text
                    style={[styles.hourChipText, selected && styles.hourChipTextSelected]}
                  >
                    {option}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.hoursPickerBlock}>
          <Text style={styles.hoursPickerLabel}>שעת סגירה</Text>
          <View style={styles.hoursOptionsRow}>
            {HOURS_OPTIONS.map((option) => {
              const selected = option === business.closingHour;
              return (
                <TouchableOpacity
                  key={`close-${option}`}
                  onPress={() => setBusiness({ ...business, closingHour: option })}
                  style={[styles.hourChip, selected && styles.hourChipSelected]}
                >
                  <Text
                    style={[styles.hourChipText, selected && styles.hourChipTextSelected]}
                  >
                    {option}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>

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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f5f7fa",
  },
  container: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 40,
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
  hoursSection: {
    marginTop: 24,
    backgroundColor: "#fff",
    padding: 16,
    borderRadius: 16,
  },
  hoursTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#333",
    textAlign: "right",
  },
  hoursSubtitle: {
    textAlign: "right",
    color: "#666",
    marginTop: 6,
  },
  hoursPickerBlock: {
    marginTop: 16,
  },
  hoursPickerLabel: {
    fontWeight: "700",
    color: "#444",
    marginBottom: 8,
    textAlign: "right",
  },
  hoursOptionsRow: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
  },
  hourChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "#f0f1f6",
    margin: 4,
  },
  hourChipSelected: {
    backgroundColor: "#6C63FF",
  },
  hourChipText: {
    color: "#444",
    fontWeight: "600",
  },
  hourChipTextSelected: {
    color: "#fff",
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
