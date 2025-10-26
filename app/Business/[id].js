import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { auth, db } from "../../firebaseConfig";

export default function BusinessPage() {
  const { id } = useLocalSearchParams(); // זה UID של בעל העסק
  const router = useRouter();

  const [business, setBusiness] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");

  // שעות לבחירה (נשאר כמו שהיה)
  const hours = [
    "09:00",
    "10:00",
    "11:00",
    "12:00",
    "13:00",
    "14:00",
    "15:00",
    "16:00",
    "17:00",
  ];

  // 🆕 ננהל סט של שעות תפוסות עבור היום הנבחר
  const [bookedTimes, setBookedTimes] = useState(new Set());

  // === שליפת פרטי העסק לפי id (כמו שהיה) ===
  useEffect(() => {
    const fetchBusiness = async () => {
      try {
        const ref = doc(db, "businesses", id);
        const snap = await getDoc(ref);
        if (snap.exists()) setBusiness({ id: snap.id, ...snap.data() });
      } catch (err) {
        console.error("שגיאה בשליפת עסק:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchBusiness();
  }, [id]);

  // 🆕 שליפת שעות תפוסות ליום הנבחר עבור העסק הזה
  useEffect(() => {
    const fetchBookedTimes = async () => {
      try {
        if (!selectedDate) return;
        const q = query(
          collection(db, "appointments"),
          where("businessId", "==", id),
          where("date", "==", selectedDate)
        );
        const snap = await getDocs(q);
        const times = new Set(snap.docs.map((d) => d.data().time));
        setBookedTimes(times);
      } catch (e) {
        console.error("שגיאה בשליפת שעות תפוסות:", e);
      }
    };
    fetchBookedTimes();
  }, [id, selectedDate]);

  // === פונקציית הזמנת תור (נשמר המבנה המקורי + שדרוגים) ===
  const handleBooking = async () => {
    const user = auth.currentUser;
    if (!user) {
      Alert.alert("דרושה התחברות", "אנא התחבר לפני קביעת תור");
      router.replace("/Login");
      return;
    }

    if (!selectedDate || !selectedTime) {
      Alert.alert("חסר מידע", "אנא בחר יום ושעה");
      return;
    }

    try {
      // בדיקה אם השעה כבר תפוסה (גם ב-UI עשינו, אבל כאן בדיקת שרת)
      const q = query(
        collection(db, "appointments"),
        where("businessId", "==", id),
        where("date", "==", selectedDate),
        where("time", "==", selectedTime)
      );

      const snap = await getDocs(q);
      if (!snap.empty) {
        Alert.alert("❌ שעה תפוסה", "מישהו כבר קבע לשעה הזו. בחר שעה אחרת.");
        return;
      }

      // 🆕 סטטוס לפי הגדרת העסק (אישור אוטומטי/ידני)
      const status = business?.autoApprove ? "approved" : "pending";

      // יצירת התור החדש
      await addDoc(collection(db, "appointments"), {
        businessId: id,
        businessName: business?.name || "",
        userId: user.uid,
        userName: user.displayName || "משתמש",
        userPhone: user.phoneNumber || "",
        date: selectedDate,
        time: selectedTime,
        status,
        createdAt: serverTimestamp(),
      });

      Alert.alert(
        "✅ התור נקבע",
        business?.autoApprove
          ? "התור אושר אוטומטית והתווסף ליומן ✅"
          : "התור נשלח וממתין לאישור העסק ⏳"
      );
      router.replace("/MyBookings");
    } catch (error) {
      console.error("שגיאה בקביעת תור:", error);
      Alert.alert("שגיאה", "לא ניתן לקבוע את התור");
    }
  };

  if (loading)
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#6C63FF" />
        <Text>טוען עסק...</Text>
      </View>
    );

  if (!business)
    return (
      <View style={styles.center}>
        <Text>❌ לא נמצא עסק</Text>
      </View>
    );

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* 🔹 כותרת */}
      <TouchableOpacity
        style={styles.backBtn}
        onPress={() => router.replace("/")}
      >
        <Ionicons name="arrow-back" size={24} color="#333" />
      </TouchableOpacity>

      {/* 🔹 תמונת העסק */}
      {business.image ? (
        <Image source={{ uri: business.image }} style={styles.image} />
      ) : (
        <View style={styles.imagePlaceholder}>
          <Ionicons name="business-outline" size={60} color="#aaa" />
        </View>
      )}

      {/* 🔹 פרטי העסק */}
      <Text style={styles.name}>{business.name}</Text>
      <Text style={styles.category}>{business.category}</Text>
      <Text style={styles.desc}>{business.description}</Text>
      <Text style={styles.info}>📍 {business.address}</Text>
      <Text style={styles.info}>📞 {business.phone}</Text>
      <Text style={styles.info}>🕒 {business.hours}</Text>

      {/* 🔹 בחירת תאריך */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>בחר תאריך</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {["2025-10-26", "2025-10-27", "2025-10-28", "2025-10-29"].map(
            (date) => (
              <TouchableOpacity
                key={date}
                onPress={() => setSelectedDate(date)}
                style={[
                  styles.dateBtn,
                  selectedDate === date && styles.selectedBtn,
                ]}
              >
                <Text
                  style={[
                    styles.dateText,
                    selectedDate === date && styles.selectedText,
                  ]}
                >
                  {date.split("-").reverse().join(".")}
                </Text>
              </TouchableOpacity>
            )
          )}
        </ScrollView>
      </View>

      {/* 🔹 בחירת שעה (עם ניטרול שעות תפוסות) */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>בחר שעה</Text>
        <View style={styles.hoursContainer}>
          {hours.map((h) => {
            const isBooked = bookedTimes.has(h);
            const isSelected = selectedTime === h;
            return (
              <TouchableOpacity
                key={h}
                onPress={() => !isBooked && setSelectedTime(h)}
                disabled={isBooked}
                style={[
                  styles.hourBtn,
                  isSelected && styles.selectedBtn,
                  isBooked && styles.hourDisabled,
                ]}
              >
                <Text
                  style={[
                    styles.hourText,
                    isSelected && styles.selectedText,
                    isBooked && { color: "#999" },
                  ]}
                >
                  {h}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* 🔹 כפתור קביעת תור */}
      <TouchableOpacity
        style={[styles.bookBtn, (!selectedDate || !selectedTime) && { opacity: 0.7 }]}
        onPress={handleBooking}
        disabled={!selectedDate || !selectedTime}
      >
        <Text style={styles.bookText}>קבע תור עכשיו</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: "#f5f7fa",
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  backBtn: {
    alignSelf: "flex-start",
    marginBottom: 10,
  },
  image: {
    width: "100%",
    height: 200,
    borderRadius: 20,
    marginBottom: 15,
  },
  imagePlaceholder: {
    width: "100%",
    height: 200,
    borderRadius: 20,
    backgroundColor: "#eee",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 15,
  },
  name: {
    fontSize: 24,
    fontWeight: "900",
    color: "#333",
    textAlign: "right",
  },
  category: {
    fontSize: 16,
    color: "#6C63FF",
    textAlign: "right",
    fontWeight: "600",
    marginBottom: 5,
  },
  desc: {
    textAlign: "right",
    color: "#555",
    marginBottom: 10,
  },
  info: {
    textAlign: "right",
    color: "#444",
    fontSize: 14,
  },
  section: {
    marginTop: 20,
  },
  sectionTitle: {
    fontWeight: "800",
    fontSize: 16,
    color: "#333",
    marginBottom: 10,
    textAlign: "right",
  },
  dateBtn: {
    backgroundColor: "#fff",
    borderRadius: 15,
    paddingVertical: 10,
    paddingHorizontal: 15,
    marginRight: 10,
    borderWidth: 1,
    borderColor: "#ddd",
  },
  hoursContainer: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: 8,
  },
  hourBtn: {
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderWidth: 1,
    borderColor: "#ddd",
  },
  hourDisabled: {
    backgroundColor: "#eee",
    borderColor: "#eee",
  },
  selectedBtn: {
    backgroundColor: "#6C63FF",
    borderColor: "#6C63FF",
  },
  dateText: {
    color: "#333",
    fontWeight: "600",
  },
  hourText: {
    color: "#333",
    fontWeight: "600",
  },
  selectedText: {
    color: "#fff",
  },
  bookBtn: {
    marginTop: 30,
    backgroundColor: "#6C63FF",
    paddingVertical: 15,
    borderRadius: 15,
    alignItems: "center",
  },
  bookText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "800",
  },
});
