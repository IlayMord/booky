import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Calendar } from "react-native-calendars";
import { BarChart } from "react-native-chart-kit";
import { SafeAreaView } from "react-native-safe-area-context";
import { auth, db } from "../firebaseConfig";
import { WEEK_DAYS } from "../constants/weekdays";

const formatHoursRange = (from, to, fallback) => {
  if (from && to) {
    return `${from} – ${to}`;
  }
  return fallback || "לא צוין";
};

export default function BusinessDashboard() {
  const [business, setBusiness] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const fetchBusinessData = async () => {
      try {
        const user = auth.currentUser;
        if (!user) {
          Alert.alert("שגיאה", "משתמש לא מחובר");
          router.replace("/Login");
          return;
        }

        const ref = doc(db, "businesses", user.uid);
        const snap = await getDoc(ref);

        if (snap.exists()) {
          setBusiness({ id: snap.id, ...snap.data() });
          await fetchBookings(user.uid);
        } else {
          Alert.alert("לא נמצא עסק", "צור אחד בעריכת פרופיל.");
          router.push("/BusinessProfileEdit");
        }
      } catch (error) {
        console.error("שגיאה בשליפת נתוני עסק:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchBusinessData();
  }, [router]);

  const fetchBookings = async (businessId) => {
    try {
      const q = query(
        collection(db, "appointments"),
        where("businessId", "==", businessId)
      );
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      setBookings(data);
    } catch (err) {
      console.error("שגיאה בשליפת תורים:", err);
    }
  };

  const updateStatus = async (id, status) => {
    try {
      await updateDoc(doc(db, "appointments", id), { status });
      setBookings((prev) =>
        prev.map((b) => (b.id === id ? { ...b, status } : b))
      );
    } catch {
      Alert.alert("שגיאה", "לא ניתן לעדכן סטטוס.");
    }
  };

  const dailyBookings = bookings.filter((b) => b.date === selectedDate);

  // ===== 🔹 חישוב סטטיסטיקות כלליות =====
  const total = bookings.length;
  const approved = bookings.filter((b) => b.status === "approved").length;
  const pending = bookings.filter((b) => b.status === "pending").length;
  const cancelled = bookings.filter((b) => b.status === "cancelled").length;

  const hasWeeklyHours = Boolean(
    business?.weeklyHours &&
      WEEK_DAYS.some((day) => {
        const schedule = business.weeklyHours[day.key];
        return schedule && !schedule.closed && schedule.open && schedule.close;
      })
  );

  const weeklyHoursRows = WEEK_DAYS.map((day) => {
    const schedule = business?.weeklyHours?.[day.key];
    if (!schedule) {
      return { ...day, text: "לא הוגדר" };
    }
    if (schedule.closed) {
      return { ...day, text: "סגור" };
    }
    if (!schedule.open || !schedule.close) {
      return { ...day, text: "-" };
    }
    return { ...day, text: `${schedule.open} – ${schedule.close}` };
  });

  // ===== 🔹 נתונים לגרף =====
  const monthlyStats = {};
  bookings.forEach((b) => {
    const month = new Date(b.date).toLocaleString("he-IL", { month: "short" });
    monthlyStats[month] = (monthlyStats[month] || 0) + 1;
  });
  const chartData = {
    labels: Object.keys(monthlyStats),
    datasets: [{ data: Object.values(monthlyStats) }],
  };

  if (loading)
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color="#6C63FF" />
        <Text>טוען נתונים...</Text>
      </SafeAreaView>
    );

  return (
    <SafeAreaView style={styles.container}>
      {/* ===== HEADER ===== */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.replace("/Login")}>
          <Ionicons name="log-out-outline" size={26} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>ניהול העסק שלי</Text>
        <TouchableOpacity onPress={() => router.push("/BusinessProfileEdit")}>
          <Ionicons name="settings-outline" size={26} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* ===== כרטיס עסק ===== */}
        <View style={styles.businessCard}>
          <Text style={styles.businessName}>{business?.name}</Text>
          <Text style={styles.businessInfo}>📞 {business?.phone || "-"}</Text>
          <Text style={styles.businessInfo}>📍 {business?.address || "-"}</Text>
          <View style={styles.weeklyHoursContainer}>
            <Text style={styles.weeklyHoursTitle}>🕒 שעות פעילות</Text>
            {hasWeeklyHours ? (
              weeklyHoursRows.map((row) => (
                <View key={row.key} style={styles.weeklyHoursRow}>
                  <Text style={styles.weeklyHoursDay}>{row.label}</Text>
                  <Text style={styles.weeklyHoursValue}>{row.text}</Text>
                </View>
              ))
            ) : (
              <Text style={styles.weeklyHoursFallback}>
                {business?.hours || "לא צוינו שעות פעילות"}
              </Text>
            )}
          </View>
          <Text style={styles.businessInfo}>
            🧾 אישור אוטומטי: {business?.autoApprove ? "כן" : "לא"}
          </Text>
        </View>

        {/* ===== 🔹 כרטיסי סטטיסטיקה ===== */}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: "#6C63FF" }]}>
            <Text style={styles.statNum}>{total}</Text>
            <Text style={styles.statLabel}>סה״כ תורים</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: "#4CAF50" }]}>
            <Text style={styles.statNum}>{approved}</Text>
            <Text style={styles.statLabel}>מאושרים</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: "#FF9800" }]}>
            <Text style={styles.statNum}>{pending}</Text>
            <Text style={styles.statLabel}>ממתינים</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: "#F44336" }]}>
            <Text style={styles.statNum}>{cancelled}</Text>
            <Text style={styles.statLabel}>בוטלו</Text>
          </View>
        </View>

        {/* ===== 🔹 גרף הזמנות ===== */}
        {Object.keys(monthlyStats).length > 0 && (
          <View style={styles.chartBox}>
            <Text style={styles.chartTitle}>📊 הזמנות לפי חודש</Text>
            <BarChart
              data={chartData}
              width={Dimensions.get("window").width - 40}
              height={250}
              chartConfig={{
                backgroundGradientFrom: "#f5f7fa",
                backgroundGradientTo: "#f5f7fa",
                color: (opacity = 1) => `rgba(108, 99, 255, ${opacity})`,
                labelColor: () => "#333",
                decimalPlaces: 0,
              }}
              style={{ borderRadius: 16 }}
            />
          </View>
        )}

        {/* ===== לוח שנה ותורים ===== */}
        <Calendar
          onDayPress={(day) => setSelectedDate(day.dateString)}
          markedDates={{
            [selectedDate]: { selected: true, selectedColor: "#6C63FF" },
          }}
          theme={{ textDirection: "rtl", arrowColor: "#6C63FF" }}
          style={styles.calendar}
        />

        <Text style={styles.sectionTitle}>
          תורים ליום {selectedDate.split("-").reverse().join(".")}
        </Text>

        {dailyBookings.length === 0 ? (
          <Text style={styles.noBookings}>אין תורים ליום זה</Text>
        ) : (
          dailyBookings.map((b) => (
            <View key={b.id} style={styles.bookingCard}>
              <Text style={styles.bookingTime}>
                ⏰ {b.time} — {b.userName || "לקוח"}
              </Text>
              <Text style={styles.bookingDetail}>📞 {b.userPhone || "-"}</Text>
              <Text style={styles.bookingDetail}>סטטוס: {b.status}</Text>

              {b.status === "pending" && (
                <View style={styles.row}>
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: "#6C63FF" }]}
                    onPress={() => updateStatus(b.id, "approved")}
                  >
                    <Text style={styles.actionText}>אשר</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: "#ff4d4d" }]}
                    onPress={() => updateStatus(b.id, "cancelled")}
                  >
                    <Text style={styles.actionText}>בטל</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f7fa" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: {
    backgroundColor: "#6C63FF",
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 15,
  },
  headerTitle: { fontSize: 20, fontWeight: "800", color: "#fff" },
  content: { padding: 20 },
  businessCard: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 20,
    marginBottom: 15,
  },
  businessName: { fontSize: 22, fontWeight: "900", textAlign: "right" },
  businessInfo: { textAlign: "right", color: "#555", fontSize: 14 },
  weeklyHoursContainer: {
    marginTop: 10,
    backgroundColor: "#f6f7fc",
    borderRadius: 14,
    padding: 12,
    gap: 6,
  },
  weeklyHoursTitle: {
    fontWeight: "800",
    color: "#333",
    textAlign: "right",
  },
  weeklyHoursRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  weeklyHoursDay: {
    color: "#555",
    fontWeight: "600",
  },
  weeklyHoursValue: {
    color: "#333",
    fontWeight: "700",
  },
  weeklyHoursFallback: {
    color: "#666",
    textAlign: "right",
  },
  statsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginBottom: 15,
  },
  statCard: {
    width: "47%",
    borderRadius: 15,
    padding: 15,
    alignItems: "center",
    marginBottom: 10,
  },
  statNum: { fontSize: 22, fontWeight: "900", color: "#fff" },
  statLabel: { fontSize: 14, color: "#fff" },
  chartBox: {
    backgroundColor: "#fff",
    borderRadius: 15,
    padding: 15,
    marginBottom: 20,
  },
  chartTitle: { fontWeight: "700", fontSize: 16, marginBottom: 10, textAlign: "right" },
  calendar: { borderRadius: 15, marginBottom: 15 },
  sectionTitle: {
    fontWeight: "800",
    fontSize: 18,
    marginVertical: 10,
    textAlign: "right",
  },
  bookingCard: {
    backgroundColor: "#fff",
    borderRadius: 15,
    padding: 15,
    marginVertical: 6,
  },
  bookingTime: { fontWeight: "700", fontSize: 16, textAlign: "right" },
  bookingDetail: { fontSize: 14, textAlign: "right", color: "#555" },
  row: { flexDirection: "row-reverse", marginTop: 8 },
  actionBtn: {
    flex: 1,
    borderRadius: 10,
    padding: 10,
    alignItems: "center",
    marginHorizontal: 4,
  },
  actionText: { color: "#fff", fontWeight: "700" },
  noBookings: { textAlign: "center", color: "#777", marginTop: 10 },
});
