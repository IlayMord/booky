import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { useEffect, useMemo, useRef, useState } from "react";
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
import {
  getDisplayWeeklyHoursRows,
  sanitizeWeeklyHours,
} from "../constants/weekdays";
import {
  CANCELLATION_FEE_AMOUNT,
  getCancellationFeeReasonLabel,
} from "../constants/fees";
import { formatILS } from "../utils/currency";

const clampBookingInterval = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 30;
  const rounded = Math.round(parsed);
  return Math.min(Math.max(rounded, 5), 180);
};

export default function BusinessDashboard() {
  const [business, setBusiness] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [loading, setLoading] = useState(true);
  const [sectionPositions, setSectionPositions] = useState({});
  const scrollRef = useRef(null);
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
          const rawData = snap.data() || {};
          const normalizedWeeklyHours = sanitizeWeeklyHours(
            rawData.weeklyHours ?? rawData.condensedWeeklyHours
          );
          const businessData = { ...rawData };
          delete businessData.weeklyHours;
          delete businessData.condensedWeeklyHours;

          setBusiness({
            id: snap.id,
            ...businessData,
            weeklyHours: normalizedWeeklyHours,
          });
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

  const handleAttendanceResponse = async (booking, attended) => {
    if (!booking?.id) {
      return;
    }

    const appointmentRef = doc(db, "appointments", booking.id);
    const updates = {
      attendanceStatus: attended ? "arrived" : "no_show",
      attendanceUpdatedAt: serverTimestamp(),
    };

    let creditDelta = 0;
    let penaltyUpdate = null;

    if (attended) {
      if (booking?.penalty?.applied && booking.penalty.reason === "no_show") {
        penaltyUpdate = {
          applied: false,
          amount: 0,
          reason: null,
          appliedAt: serverTimestamp(),
        };
        creditDelta = -Math.abs(booking.penalty.amount || CANCELLATION_FEE_AMOUNT);
      }
    } else {
      const alreadyNoShow =
        booking?.penalty?.applied && booking.penalty.reason === "no_show";
      if (!alreadyNoShow) {
        penaltyUpdate = {
          applied: true,
          amount: CANCELLATION_FEE_AMOUNT,
          reason: "no_show",
          appliedAt: serverTimestamp(),
        };
        creditDelta = CANCELLATION_FEE_AMOUNT;
      }
    }

    if (penaltyUpdate) {
      updates.penalty = penaltyUpdate;
    }

    try {
      await updateDoc(appointmentRef, updates);

      if (creditDelta !== 0 && booking.userId) {
        await setDoc(
          doc(db, "users", booking.userId),
          {
            cancellationCredit: increment(creditDelta),
          },
          { merge: true }
        );
      }

      setBookings((prev) =>
        prev.map((b) => {
          if (b.id !== booking.id) return b;
          const next = {
            ...b,
            ...updates,
          };
          if (penaltyUpdate) {
            next.penalty = penaltyUpdate;
          }
          return next;
        })
      );

      if (creditDelta > 0) {
        Alert.alert(
          "עודכן",
          `הלקוח סומן כלא הגיע ונוספו דמי ביטול של ${formatILS(creditDelta)}.`
        );
      } else if (creditDelta < 0) {
        Alert.alert(
          "עודכן",
          "סימון אי ההגעה הוסר והחיוב עבור דמי הביטול הוחזר."
        );
      } else {
        Alert.alert(
          "עודכן",
          attended
            ? "הלקוח סומן כמי שהגיע לתור."
            : "הלקוח סומן כמי שלא הגיע לתור."
        );
      }
    } catch (error) {
      console.error("שגיאה בעדכון סטטוס הגעה:", error);
      Alert.alert("שגיאה", "לא ניתן לעדכן את הסטטוס כרגע.");
    }
  };

  const dailyBookings = bookings.filter((b) => b.date === selectedDate);

  // ===== 🔹 חישוב סטטיסטיקות כלליות =====
  const total = bookings.length;
  const approved = bookings.filter((b) => b.status === "approved").length;
  const pending = bookings.filter((b) => b.status === "pending").length;
  const cancelled = bookings.filter((b) => b.status === "cancelled").length;

  const displayWeeklyHours = useMemo(() => {
    if (!business?.weeklyHours) {
      return [];
    }
    return getDisplayWeeklyHoursRows(business.weeklyHours);
  }, [business?.weeklyHours]);

  const hasWeeklyHours = displayWeeklyHours.length > 0;

  const legacyHoursFallback = useMemo(() => {
    if (Array.isArray(business?.hours)) {
      return business.hours.join("\n");
    }
    if (typeof business?.hours === "string") {
      return business.hours;
    }
    return "לא צוינו שעות פעילות";
  }, [business?.hours]);

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

  const bookingWindowDays = (() => {
    const parsed = Number(business?.bookingWindowDays);
    if (!Number.isFinite(parsed)) return 30;
    return Math.min(Math.max(Math.round(parsed), 1), 90);
  })();

  const bookingIntervalMinutes = clampBookingInterval(
    business?.bookingIntervalMinutes
  );

  const handleSectionLayout = (key) => (event) => {
    const { y } = event.nativeEvent.layout;
    setSectionPositions((prev) => ({ ...prev, [key]: y }));
  };

  const scrollToSection = (key) => {
    const y = sectionPositions[key];
    if (scrollRef.current && typeof y === "number") {
      scrollRef.current.scrollTo({ y: Math.max(y - 20, 0), animated: true });
    }
  };

  const quickCategories = [
    {
      key: "overview",
      label: "סקירה",
      icon: "home-outline",
      description: "פרטי העסק והגדרות",
      onPress: () => scrollToSection("overview"),
    },
    {
      key: "stats",
      label: "סטטיסטיקות",
      icon: "bar-chart-outline",
      description: "התפלגות תורים",
      onPress: () => scrollToSection("stats"),
    },
    {
      key: "calendar",
      label: "יומן",
      icon: "calendar-outline",
      description: "בחירת יום ותורים",
      onPress: () => scrollToSection("calendar"),
    },
    {
      key: "profile",
      label: "עריכת עסק",
      icon: "settings-outline",
      description: "שינוי פרטים",
      onPress: () => router.push("/BusinessProfileEdit"),
    },
  ];

  if (loading)
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#6C63FF" />
          <Text>טוען נתונים...</Text>
        </View>
      </SafeAreaView>
    );

  return (
    <SafeAreaView style={styles.safeArea}>
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

      <View style={styles.body}>
        <View style={styles.categoryRow}>
          {quickCategories.map((category) => (
            <TouchableOpacity
              key={category.key}
              style={styles.categoryCard}
              onPress={category.onPress}
              activeOpacity={0.8}
            >
              <View style={styles.categoryIconWrap}>
                <Ionicons
                  name={category.icon}
                  size={22}
                  color="#6C63FF"
                />
              </View>
              <Text style={styles.categoryLabel}>{category.label}</Text>
              <Text style={styles.categoryDescription} numberOfLines={2}>
                {category.description}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {/* ===== כרטיס עסק ===== */}
          <View style={styles.businessCard} onLayout={handleSectionLayout("overview")}>
            <Text style={styles.businessName}>{business?.name}</Text>
            <Text style={styles.businessInfo}>📞 {business?.phone || "-"}</Text>
            <Text style={styles.businessInfo}>📍 {business?.address || "-"}</Text>
            <View style={styles.scheduleSettings}>
              <Text style={styles.businessInfo}>
              🗓️ פתיחת יומן: {bookingWindowDays} ימים קדימה
            </Text>
            <Text style={styles.businessInfo}>
              🧾 אישור אוטומטי: {business?.autoApprove ? "כן" : "לא"}
            </Text>
            <Text style={styles.businessInfo}>
              ⏱️ מרווח תורים: כל {bookingIntervalMinutes} דקות
            </Text>
          </View>
          <View style={styles.weeklyHoursContainer}>
            <Text style={styles.weeklyHoursTitle}>🕒 שעות פעילות</Text>
            {hasWeeklyHours ? (
              displayWeeklyHours.map((row) => (
                <View key={row.key} style={styles.weeklyHoursRow}>
                  <Text style={styles.weeklyHoursDay}>{row.label}</Text>
                  <Text style={styles.weeklyHoursValue}>{row.text}</Text>
                </View>
              ))
            ) : (
              <Text style={styles.weeklyHoursFallback}>
                {legacyHoursFallback}
              </Text>
            )}
          </View>
        </View>

          {/* ===== 🔹 כרטיסי סטטיסטיקה ===== */}
          <View
            style={styles.statsRow}
            onLayout={handleSectionLayout("stats")}
          >
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
            <View style={styles.chartBox} onLayout={handleSectionLayout("statsChart")}>
              <Text style={styles.chartTitle}>📊 הזמנות לפי חודש</Text>
              <BarChart
                data={chartData}
                width={Dimensions.get("window").width - 60}
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
          <View onLayout={handleSectionLayout("calendar")}>
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

                  {b.penalty?.applied && (
                    <Text style={styles.penaltyBadge}>
                      💳 דמי ביטול {formatILS(b.penalty?.amount || CANCELLATION_FEE_AMOUNT)}
                      {b.penalty?.reason
                        ? ` · ${getCancellationFeeReasonLabel(b.penalty.reason)}`
                        : ""}
                    </Text>
                  )}

                  {b.status !== "cancelled" && (
                    <View style={styles.attendanceContainer}>
                      <Text style={styles.attendanceLabel}>הלקוח הגיע?</Text>
                      <View style={styles.attendanceButtons}>
                        <TouchableOpacity
                          style={[
                            styles.attendanceButton,
                            b.attendanceStatus === "arrived" &&
                              styles.attendanceButtonActive,
                          ]}
                          onPress={() => handleAttendanceResponse(b, true)}
                        >
                          <Text
                            style={[
                              styles.attendanceButtonText,
                              b.attendanceStatus === "arrived" &&
                                styles.attendanceButtonTextActive,
                            ]}
                          >
                            הגיע
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[
                            styles.attendanceButton,
                            styles.attendanceButtonOutlineDanger,
                            b.attendanceStatus === "no_show" &&
                              styles.attendanceButtonActiveDanger,
                          ]}
                          onPress={() => handleAttendanceResponse(b, false)}
                        >
                          <Text
                            style={[
                              styles.attendanceButtonText,
                              styles.attendanceButtonTextDanger,
                            ]}
                          >
                            לא הגיע
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}

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
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#6C63FF" },
  body: {
    flex: 1,
    backgroundColor: "#f5f7fa",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingTop: 24,
  },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: {
    backgroundColor: "#6C63FF",
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 24,
  },
  headerTitle: { fontSize: 20, fontWeight: "800", color: "#fff" },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    gap: 18,
  },
  categoryRow: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginBottom: 16,
    gap: 12,
  },
  categoryCard: {
    width: "47%",
    backgroundColor: "#fff",
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: "flex-end",
    shadowColor: "#1a237e",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
    gap: 6,
  },
  categoryIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "#f1f0ff",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  categoryLabel: {
    fontSize: 16,
    fontWeight: "800",
    color: "#333",
  },
  categoryDescription: {
    fontSize: 12,
    color: "#666",
    textAlign: "right",
  },
  businessCard: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 20,
  },
  businessName: { fontSize: 22, fontWeight: "900", textAlign: "right" },
  businessInfo: { textAlign: "right", color: "#555", fontSize: 14 },
  scheduleSettings: {
    marginTop: 8,
    gap: 4,
  },
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
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  weeklyHoursDay: {
    color: "#555",
    fontWeight: "600",
    textAlign: "right",
  },
  weeklyHoursValue: {
    color: "#333",
    fontWeight: "700",
    textAlign: "left",
  },
  weeklyHoursFallback: {
    color: "#666",
    textAlign: "right",
  },
  statsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 12,
  },
  statCard: {
    width: "47%",
    borderRadius: 15,
    padding: 15,
    alignItems: "center",
  },
  statNum: { fontSize: 22, fontWeight: "900", color: "#fff" },
  statLabel: { fontSize: 14, color: "#fff" },
  chartBox: {
    backgroundColor: "#fff",
    borderRadius: 15,
    padding: 15,
  },
  chartTitle: { fontWeight: "700", fontSize: 16, marginBottom: 10, textAlign: "right" },
  calendar: { borderRadius: 15, marginBottom: 15 },
  sectionTitle: {
    fontWeight: "800",
    fontSize: 18,
    marginBottom: 10,
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
  penaltyBadge: {
    marginTop: 6,
    textAlign: "right",
    color: "#b34700",
    fontWeight: "600",
  },
  attendanceContainer: {
    marginTop: 12,
  },
  attendanceLabel: {
    fontSize: 14,
    fontWeight: "700",
    textAlign: "right",
    color: "#3e3e63",
    marginBottom: 6,
  },
  attendanceButtons: {
    flexDirection: "row-reverse",
    justifyContent: "flex-start",
    alignItems: "center",
  },
  attendanceButton: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#6C63FF",
    paddingVertical: 6,
    paddingHorizontal: 14,
    marginHorizontal: 5,
  },
  attendanceButtonActive: {
    backgroundColor: "#6C63FF",
  },
  attendanceButtonOutlineDanger: {
    borderColor: "#F44336",
  },
  attendanceButtonActiveDanger: {
    backgroundColor: "rgba(244,67,54,0.12)",
  },
  attendanceButtonText: {
    color: "#6C63FF",
    fontWeight: "700",
    fontSize: 14,
  },
  attendanceButtonTextActive: {
    color: "#fff",
  },
  attendanceButtonTextDanger: {
    color: "#F44336",
  },
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
