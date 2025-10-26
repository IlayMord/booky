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
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { auth, db } from "../../firebaseConfig";
import { WEEK_DAYS, getWeekdayKeyFromDate } from "../../constants/weekdays";

const clampBookingWindow = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 30;
  return Math.min(Math.max(Math.round(parsed), 1), 90);
};

const clampSlotInterval = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 30;
  const rounded = Math.round(parsed);
  return Math.min(Math.max(rounded, 5), 180);
};

const parseTimeToMinutes = (time) => {
  if (!/^\d{2}:\d{2}$/.test(time || "")) return NaN;
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
};

const formatMinutesToTime = (value) => {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
};

const generateTimeSlots = (from, to, step = 30) => {
  const start = parseTimeToMinutes(from);
  const end = parseTimeToMinutes(to);
  const normalizedStep = Number(step);
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    !Number.isFinite(normalizedStep) ||
    start >= end ||
    normalizedStep <= 0
  ) {
    return [];
  }

  const slots = [];
  for (let minutes = start; minutes + normalizedStep <= end; minutes += normalizedStep) {
    slots.push(formatMinutesToTime(minutes));
  }
  return slots;
};

const resolveOperatingWindowForDay = (business, dayKey) => {
  if (!business) return null;
  const schedule = business.weeklyHours?.[dayKey];
  if (schedule?.closed) {
    return null;
  }

  const opening = schedule?.open || business?.openingHour;
  const closing = schedule?.close || business?.closingHour;

  if (!opening || !closing) {
    return null;
  }

  if (parseTimeToMinutes(opening) >= parseTimeToMinutes(closing)) {
    return null;
  }

  return { opening, closing };
};

const formatDateLabel = (date) => {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}.${month}.${year}`;
};

const formatDateKey = (date) => {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${year}-${month}-${day}`;
};

const getWeekdayLabels = (dayKey) => {
  const match = WEEK_DAYS.find((day) => day.key === dayKey);
  return {
    full: match?.label ?? "",
    short: match?.shortLabel ?? "",
  };
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

  const bookingWindowLimit = useMemo(
    () => clampBookingWindow(business?.bookingWindowDays),
    [business?.bookingWindowDays]
  );

  const bookingIntervalMinutes = useMemo(
    () => clampSlotInterval(business?.bookingIntervalMinutes),
    [business?.bookingIntervalMinutes]
  );

  const dateOptions = useMemo(() => {
    if (!business) return [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return Array.from({ length: bookingWindowLimit }, (_, index) => {
      const current = new Date(today);
      current.setDate(today.getDate() + index);
      const iso = formatDateKey(current);
      const dayKey = getWeekdayKeyFromDate(current);
      const window = resolveOperatingWindowForDay(business, dayKey);
      const labels = getWeekdayLabels(dayKey);

      return {
        value: iso,
        display: formatDateLabel(current),
        weekdayShort: labels.short,
        disabled:
          !window ||
          generateTimeSlots(
            window.opening,
            window.closing,
            bookingIntervalMinutes
          ).length === 0,
      };
    });
  }, [bookingIntervalMinutes, bookingWindowLimit, business]);

  const hasAvailableDates = useMemo(
    () => dateOptions.some((option) => !option.disabled),
    [dateOptions]
  );

  const availableHours = useMemo(() => {
    if (!selectedDate) return [];

    const dayKey = getWeekdayKeyFromDate(selectedDate);
    if (!dayKey) return [];

    const window = resolveOperatingWindowForDay(business, dayKey);
    if (!window) {
      return [];
    }

    return generateTimeSlots(
      window.opening,
      window.closing,
      bookingIntervalMinutes
    );
  }, [bookingIntervalMinutes, business, selectedDate]);

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

  useEffect(() => {
    if (!dateOptions.length) return;
    const firstEnabled = dateOptions.find((option) => !option.disabled);
    if (!firstEnabled) return;

    setSelectedDate((prev) => {
      if (
        prev &&
        dateOptions.some(
          (option) => option.value === prev && !option.disabled
        )
      ) {
        return prev;
      }
      return firstEnabled.value;
    });
  }, [dateOptions]);

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

  const handleNavigation = async (provider) => {
    if (!business?.address) {
      Alert.alert("לא נמצאה כתובת", "העסק לא הגדיר כתובת לניווט");
      return;
    }

    const encodedAddress = encodeURIComponent(business.address);
    const url =
      provider === "waze"
        ? `https://waze.com/ul?q=${encodedAddress}`
        : `https://www.google.com/maps/search/?api=1&query=${encodedAddress}`;

    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        Alert.alert("שגיאה", "לא ניתן לפתוח את אפליקציית הניווט המבוקשת");
        return;
      }
      await Linking.openURL(url);
    } catch (error) {
      console.error("שגיאה בפתיחת ניווט", error);
      Alert.alert("שגיאה", "אירעה תקלה בעת ניסיון פתיחת הניווט");
    }
  };

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
      <View style={styles.infoRow}>
        <Text style={styles.infoValue}>{business.address || "לא צוינה כתובת"}</Text>
        <Ionicons name="location-outline" size={18} color="#6C63FF" />
      </View>
      {business.address ? (
        <View style={styles.navigationRow}>
          <TouchableOpacity
            style={styles.navigationBtn}
            onPress={() => handleNavigation("waze")}
          >
            <Ionicons name="navigate-outline" size={16} color="#6C63FF" />
            <Text style={styles.navigationText}>פתח ב-Waze</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.navigationBtn}
            onPress={() => handleNavigation("google")}
          >
            <Ionicons name="map-outline" size={16} color="#6C63FF" />
            <Text style={styles.navigationText}>פתח במפות</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      <View style={styles.infoRow}>
        <Text style={styles.infoValue}>{business.phone || "לא צויין"}</Text>
        <Ionicons name="call-outline" size={18} color="#6C63FF" />
      </View>
      <View style={styles.hoursContainerBox}>
        <Text style={styles.hoursTitle}>🕒 שעות פעילות</Text>
        {hasWeeklyHours ? (
          weeklyHoursRows.map((row) => (
            <View key={row.key} style={styles.hoursRow}>
              <Text style={styles.hoursDay}>{row.label}</Text>
              <Text style={styles.hoursValue}>{row.text}</Text>
            </View>
          ))
        ) : (
          <Text style={styles.hoursFallback}>{hoursLabel}</Text>
        )}
      </View>

      {/* 🔹 בחירת תאריך */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          בחר תאריך ({bookingWindowLimit} ימים קדימה)
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.dateScroll}
        >
          {dateOptions.map((option) => {
            const isSelected = selectedDate === option.value;
            return (
              <TouchableOpacity
                key={option.value}
                onPress={() => !option.disabled && setSelectedDate(option.value)}
                style={[
                  styles.dateBtn,
                  isSelected && styles.selectedBtn,
                  option.disabled && styles.dateDisabled,
                ]}
                disabled={option.disabled}
              >
                <Text
                  style={[
                    styles.dateWeekday,
                    isSelected && styles.selectedDateText,
                    option.disabled && styles.dateDisabledText,
                  ]}
                >
                  {option.weekdayShort}
                </Text>
                <Text
                  style={[
                    styles.dateText,
                    isSelected && styles.selectedDateText,
                    option.disabled && styles.dateDisabledText,
                  ]}
                >
                  {option.display}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        {!hasAvailableDates && (
          <Text style={styles.emptyState}>
            אין תאריכים זמינים על פי ההגדרות הנוכחיות
          </Text>
        )}
      </View>

      {/* 🔹 בחירת שעה */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>בחר שעה</Text>
        {availableHours.length ? (
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
        ) : (
          <Text style={styles.emptyState}>
            אין שעות פעילות לתאריך שבחרת
          </Text>
        )}
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
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
    marginBottom: 4,
  },
  infoValue: {
    color: "#333",
    fontSize: 14,
    fontWeight: "600",
    textAlign: "right",
  },
  navigationRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    marginBottom: 6,
  },
  navigationBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#eef0ff",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    gap: 6,
  },
  navigationText: {
    color: "#454aa0",
    fontWeight: "700",
  },
  hoursContainerBox: {
    marginTop: 12,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 14,
    gap: 6,
  },
  hoursTitle: {
    fontWeight: "800",
    color: "#333",
    textAlign: "right",
  },
  hoursRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  hoursDay: {
    color: "#555",
    fontWeight: "600",
  },
  hoursValue: {
    color: "#333",
    fontWeight: "700",
  },
  hoursFallback: {
    color: "#666",
    textAlign: "right",
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
  dateScroll: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    paddingHorizontal: 4,
  },
  dateBtn: {
    width: 110,
    backgroundColor: "#fff",
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginLeft: 0,
    borderWidth: 1,
    borderColor: "#e0e3ef",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  selectedBtn: {
    backgroundColor: "#6C63FF",
    borderColor: "#6C63FF",
  },
  dateWeekday: {
    fontSize: 12,
    color: "#6C63FF",
    fontWeight: "700",
  },
  dateText: {
    color: "#333",
    fontWeight: "700",
    fontSize: 14,
  },
  selectedDateText: {
    color: "#fff",
  },
  dateDisabled: {
    backgroundColor: "#f1f2f6",
    borderColor: "#e6e7ef",
  },
  dateDisabledText: {
    color: "#b5b8c9",
  },
  hoursContainer: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
  },
  emptyState: {
    textAlign: "center",
    color: "#7c8095",
    fontWeight: "600",
    paddingVertical: 12,
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
