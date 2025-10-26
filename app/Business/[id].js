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
import { useEffect, useMemo, useState } from "react";
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

const DEFAULT_TIME_SLOTS = [
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
  if (!/^\d{2}:\d{2}$/.test(time || "")) return NaN;
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
};

const formatHoursRange = (from, to, fallback) => {
  if (from && to) {
    return `${from} – ${to}`;
  }
  return fallback || "לא צוין";
};

export default function BusinessPage() {
  const { id } = useLocalSearchParams(); // זה UID של בעל העסק
  const router = useRouter();

  const [business, setBusiness] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");

  // 🆕 ננהל סט של שעות תפוסות עבור היום הנבחר
  const [bookedTimes, setBookedTimes] = useState(new Set());

  const availableHours = useMemo(() => {
    if (!business?.openingHour || !business?.closingHour) {
      return DEFAULT_TIME_SLOTS;
    }

    const openMinutes = timeToMinutes(business.openingHour);
    const closeMinutes = timeToMinutes(business.closingHour);

    if (!Number.isFinite(openMinutes) || !Number.isFinite(closeMinutes)) {
      return DEFAULT_TIME_SLOTS;
    }

    if (openMinutes >= closeMinutes) {
      return DEFAULT_TIME_SLOTS;
    }

    return DEFAULT_TIME_SLOTS.filter((slot) => {
      const value = timeToMinutes(slot);
      return value >= openMinutes && value <= closeMinutes;
    });
  }, [business?.openingHour, business?.closingHour]);

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

  useEffect(() => {
    if (selectedTime && !availableHours.includes(selectedTime)) {
      setSelectedTime("");
    }
  }, [availableHours, selectedTime]);

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

    if (!availableHours.includes(selectedTime)) {
      Alert.alert(
        "שעה לא זמינה",
        "השעה שנבחרה אינה תואמת את שעות הפעילות של העסק"
      );
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

  const hoursLabel = formatHoursRange(
    business?.openingHour,
    business?.closingHour,
    business?.hours
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
      <Text style={styles.info}>🕒 {hoursLabel}</Text>

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
                    selectedDate === date && styles.selectedDateText,
                  ]}
                >
                  {date.split("-").reverse().join(".")}
                </Text>
              </TouchableOpacity>
            )
          )}
        </ScrollView>
      </View>

      {/* 🔹 בחירת שעה */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>בחר שעה</Text>
        <View style={styles.hoursContainer}>
          {availableHours.map((h) => {
            const disabled = bookedTimes.has(h);
            const selected = selectedTime === h;
            return (
              <TouchableOpacity
                key={h}
                disabled={disabled}
                onPress={() => setSelectedTime(h)}
                style={[
                  styles.hourBtn,
                  disabled && styles.disabledHour,
                  selected && styles.selectedHour,
                ]}
              >
                <Text
                  style={[
                    styles.hourText,
                    disabled && styles.disabledHourText,
                    selected && styles.selectedHourText,
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
        style={[
          styles.bookBtn,
          (!selectedDate || !selectedTime) && { opacity: 0.7 },
        ]}
        onPress={handleBooking}
        disabled={!selectedDate || !selectedTime}
      >
        <Text style={styles.bookBtnText}>קבע תור עכשיו</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    paddingBottom: 40,
    backgroundColor: "#f5f7fa",
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  backBtn: { alignSelf: "flex-start", marginBottom: 10 },
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
    marginBottom: 15,
    backgroundColor: "#eee",
    justifyContent: "center",
    alignItems: "center",
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
  selectedBtn: {
    backgroundColor: "#6C63FF",
    borderColor: "#6C63FF",
  },
  dateText: {
    color: "#333",
    fontWeight: "600",
  },
  selectedDateText: {
    color: "#fff",
  },
  hoursContainer: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
  },
  hourBtn: {
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderWidth: 1,
    borderColor: "#ddd",
    marginLeft: 10,
    marginBottom: 10,
  },
  hourText: {
    color: "#333",
    fontWeight: "600",
  },
  selectedHour: {
    backgroundColor: "#6C63FF",
    borderColor: "#6C63FF",
  },
  selectedHourText: {
    color: "#fff",
  },
  disabledHour: {
    backgroundColor: "#eee",
    borderColor: "#eee",
  },
  disabledHourText: {
    color: "#aaa",
  },
  bookBtn: {
    marginTop: 30,
    backgroundColor: "#6C63FF",
    paddingVertical: 15,
    borderRadius: 15,
    alignItems: "center",
  },
  bookBtnText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "800",
  },
});
