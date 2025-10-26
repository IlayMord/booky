import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
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
import { useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { WEEK_DAYS, getWeekdayKeyFromDate } from "../constants/weekdays";
import { auth, db } from "../firebaseConfig";

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

const formatDateKey = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return "";
  }
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${year}-${month}-${day}`;
};

const formatDateLabel = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return "";
  }
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}.${month}.${year}`;
};

const parseDateKey = (value) => {
  if (typeof value !== "string") return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, year, month, day] = match;
  return new Date(Number(year), Number(month) - 1, Number(day));
};

const normaliseBookingDate = (value) => {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const cleaned = String(value).replace(/[\.]/g, "/");
  const parts = cleaned.split("/");
  if (parts.length === 3) {
    const [day, month, yearPart] = parts.map((part) => part.trim());
    if (day && month && yearPart) {
      const year = yearPart.length === 2 ? `20${yearPart}` : yearPart;
      return `${year.padStart(4, "0")}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    }
  }

  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return formatDateKey(parsed);
  }

  return "";
};

const normaliseBookingTime = (value) => {
  if (!value) return "";
  const match = String(value).match(/(\d{2}:\d{2})/);
  return match ? match[1] : "";
};

const formatBookingDateForDisplay = (value) => {
  const normalised = normaliseBookingDate(value);
  if (!normalised) return value;
  const date = parseDateKey(normalised);
  return date ? formatDateLabel(date) : value;
};

export default function MyBookings() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [rescheduleVisible, setRescheduleVisible] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [rescheduleBusiness, setRescheduleBusiness] = useState(null);
  const [rescheduleLoading, setRescheduleLoading] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");
  const [rescheduleBookedTimes, setRescheduleBookedTimes] = useState(new Set());
  const router = useRouter();

  const fetchBookings = async () => {
    try {
      const user = auth.currentUser;
      if (!user) return;
      const q = query(
        collection(db, "appointments"),
        where("userId", "==", user.uid)
      );
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      setBookings(data);
    } catch (error) {
      console.error("Error fetching bookings:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBookings();
  }, []);

  const originalBookingDate = useMemo(
    () => normaliseBookingDate(selectedBooking?.date),
    [selectedBooking?.date]
  );
  const originalBookingTime = useMemo(
    () => normaliseBookingTime(selectedBooking?.time),
    [selectedBooking?.time]
  );

  const bookingWindowLimit = useMemo(
    () => clampBookingWindow(rescheduleBusiness?.bookingWindowDays),
    [rescheduleBusiness?.bookingWindowDays]
  );

  const bookingIntervalMinutes = useMemo(
    () => clampSlotInterval(rescheduleBusiness?.bookingIntervalMinutes),
    [rescheduleBusiness?.bookingIntervalMinutes]
  );

  useEffect(() => {
    const loadBusiness = async () => {
      if (!selectedBooking?.businessId) {
        setRescheduleBusiness(null);
        return;
      }

      setRescheduleLoading(true);
      try {
        const ref = doc(db, "businesses", selectedBooking.businessId);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          setRescheduleBusiness({ id: snap.id, ...snap.data() });
        } else {
          setRescheduleBusiness(null);
        }
      } catch (error) {
        console.error("Error fetching business for reschedule:", error);
        setRescheduleBusiness(null);
      } finally {
        setRescheduleLoading(false);
      }
    };

    if (rescheduleVisible) {
      loadBusiness();
    }
  }, [rescheduleVisible, selectedBooking?.businessId]);

  useEffect(() => {
    if (!rescheduleVisible) return;
    setRescheduleDate(originalBookingDate);
    setRescheduleTime(originalBookingTime);
  }, [originalBookingDate, originalBookingTime, rescheduleVisible]);

  const dateOptions = useMemo(() => {
    if (!rescheduleBusiness) return [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return Array.from({ length: bookingWindowLimit }, (_, index) => {
      const current = new Date(today);
      current.setDate(today.getDate() + index);
      const key = formatDateKey(current);
      const dayKey = getWeekdayKeyFromDate(current);
      const window = resolveOperatingWindowForDay(rescheduleBusiness, dayKey);

      const slots = window
        ? generateTimeSlots(
            window.opening,
            window.closing,
            bookingIntervalMinutes
          )
        : [];

      return {
        value: key,
        display: formatDateLabel(current),
        weekday: WEEK_DAYS.find((day) => day.key === dayKey)?.shortLabel ?? "",
        disabled: !window || slots.length === 0,
      };
    });
  }, [bookingIntervalMinutes, bookingWindowLimit, rescheduleBusiness]);

  const availableHours = useMemo(() => {
    if (!rescheduleDate) return [];
    const dayKey = getWeekdayKeyFromDate(rescheduleDate);
    if (!dayKey) return [];

    const window = resolveOperatingWindowForDay(rescheduleBusiness, dayKey);
    if (!window) return [];

    return generateTimeSlots(
      window.opening,
      window.closing,
      bookingIntervalMinutes
    );
  }, [bookingIntervalMinutes, rescheduleBusiness, rescheduleDate]);

  useEffect(() => {
    if (!rescheduleVisible) return;
    if (!dateOptions.length) {
      setRescheduleDate("");
      return;
    }

    setRescheduleDate((current) => {
      if (
        current &&
        dateOptions.some((option) => option.value === current && !option.disabled)
      ) {
        return current;
      }
      const fallback = dateOptions.find((option) => !option.disabled);
      return fallback ? fallback.value : current || "";
    });
  }, [dateOptions, rescheduleVisible]);

  useEffect(() => {
    if (!rescheduleVisible || !rescheduleDate || !selectedBooking?.businessId) {
      setRescheduleBookedTimes(new Set());
      return;
    }

    let cancelled = false;
    const fetchBooked = async () => {
      try {
        const appointmentsQuery = query(
          collection(db, "appointments"),
          where("businessId", "==", selectedBooking.businessId),
          where("date", "==", rescheduleDate)
        );
        const snap = await getDocs(appointmentsQuery);
        if (cancelled) return;
        const times = new Set(
          snap.docs
            .filter((d) => d.id !== selectedBooking.id)
            .map((d) => normaliseBookingTime(d.data().time))
        );
        setRescheduleBookedTimes(times);
      } catch (error) {
        console.error("Error fetching booked times:", error);
        setRescheduleBookedTimes(new Set());
      }
    };

    fetchBooked();

    return () => {
      cancelled = true;
    };
  }, [rescheduleDate, rescheduleVisible, selectedBooking?.businessId, selectedBooking?.id]);

  useEffect(() => {
    if (!rescheduleVisible) return;
    if (!availableHours.length) {
      setRescheduleTime("");
      return;
    }

    setRescheduleTime((current) => {
      if (
        current &&
        availableHours.includes(current) &&
        !rescheduleBookedTimes.has(current)
      ) {
        return current;
      }

      const fallback = availableHours.find(
        (slot) => !rescheduleBookedTimes.has(slot)
      );
      return fallback ?? "";
    });
  }, [availableHours, rescheduleBookedTimes, rescheduleVisible]);

  const closeRescheduleModal = () => {
    setRescheduleVisible(false);
    setSelectedBooking(null);
    setRescheduleBusiness(null);
    setRescheduleDate("");
    setRescheduleTime("");
    setRescheduleBookedTimes(new Set());
  };

  const handleCancel = async (id) => {
    try {
      await updateDoc(doc(db, "appointments", id), { status: "cancelled" });
      Alert.alert("❌ בוטל", "התור בוטל בהצלחה");
      fetchBookings();
    } catch (error) {
      Alert.alert("שגיאה", error.message);
    }
  };

  const handleReschedule = async () => {
    if (!selectedBooking) return;

    if (!rescheduleDate || !rescheduleTime) {
      Alert.alert("שגיאה", "אנא בחר תאריך ושעה החדשים לתור");
      return;
    }

    const option = dateOptions.find((item) => item.value === rescheduleDate);
    if (!option || option.disabled) {
      Alert.alert("שגיאה", "התאריך שנבחר אינו זמין להזמנה");
      return;
    }

    if (!availableHours.includes(rescheduleTime)) {
      Alert.alert("שגיאה", "השעה שנבחרה אינה תואמת את שעות הפעילות");
      return;
    }

    if (rescheduleBookedTimes.has(rescheduleTime)) {
      Alert.alert("שעה תפוסה", "מישהו כבר קבע לשעה הזו. בחר שעה אחרת.");
      return;
    }

    try {
      await updateDoc(doc(db, "appointments", selectedBooking.id), {
        date: rescheduleDate,
        time: rescheduleTime,
        status: "rescheduled",
      });
      Alert.alert("✅ עודכן", "התור נדחה בהצלחה");
      closeRescheduleModal();
      fetchBookings();
    } catch (error) {
      Alert.alert("שגיאה", error.message);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6C63FF" />
        <Text style={styles.loadingText}>טוען תורים...</Text>
      </View>
    );
  }

  return (
    <LinearGradient colors={["#f5f7fa", "#e4ebf1"]} style={styles.container}>
      {/* 🔹 כותרת */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.replace("/Profile")}
          style={styles.backBtn}
        >
          <Ionicons name="arrow-back" size={26} color="#6C63FF" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>התורים שלי</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 80 }}>
        {bookings.length === 0 ? (
          <Text style={styles.noBookings}>אין לך תורים כרגע.</Text>
        ) : (
          bookings.map((b) => {
            const displayDate = formatBookingDateForDisplay(b.date);
            const displayTime = normaliseBookingTime(b.time) || b.time;

            return (
              <View key={b.id} style={styles.card}>
                <Text style={[styles.business, styles.rtl]}>{b.businessName}</Text>
                <Text style={[styles.detail, styles.rtl]}>
                  📅 {displayDate} | ⏰ {displayTime}
                </Text>
                <Text
                  style={[
                    styles.status,
                    styles.rtl,
                    b.status === "approved"
                      ? styles.approved
                      : b.status === "cancelled"
                      ? styles.cancelled
                      : b.status === "rescheduled"
                      ? styles.rescheduled
                      : styles.pending,
                  ]}
                >
                  {b.status === "approved"
                    ? "מאושר"
                    : b.status === "cancelled"
                    ? "בוטל"
                    : b.status === "rescheduled"
                    ? "נדחה"
                    : "ממתין לאישור"}
                </Text>

                {b.status !== "cancelled" && (
                  <View style={styles.buttonsRow}>
                    <TouchableOpacity
                      style={styles.cancelButton}
                      onPress={() => handleCancel(b.id)}
                    >
                      <Text style={styles.cancelText}>בטל תור</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.rescheduleButton}
                      onPress={() => {
                        setRescheduleBusiness(null);
                        setRescheduleBookedTimes(new Set());
                        setRescheduleDate("");
                        setRescheduleTime("");
                        setSelectedBooking(b);
                        setRescheduleVisible(true);
                      }}
                    >
                      <Text style={styles.rescheduleText}>דחה תור</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>

      {/* 🔹 חלונית דחייה */}
      <Modal visible={rescheduleVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={[styles.modalTitle, styles.rtl]}>
              דחיית תור — {selectedBooking?.businessName}
            </Text>

            {rescheduleLoading ? (
              <View style={styles.modalLoading}>
                <ActivityIndicator color="#6C63FF" />
              </View>
            ) : !rescheduleBusiness ? (
              <Text style={[styles.modalInfo, styles.rtl]}>
                לא הצלחנו לטעון את הגדרות העסק. נסה שוב מאוחר יותר.
              </Text>
            ) : (
              <>
                <Text style={[styles.modalSectionTitle, styles.rtl]}>
                  בחר תאריך ({bookingWindowLimit} ימים קדימה)
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.modalDateScroll}
                >
                  {dateOptions.map((option) => {
                    const isSelected = rescheduleDate === option.value;
                    return (
                      <TouchableOpacity
                        key={option.value}
                        style={[
                          styles.modalDateBtn,
                          isSelected && styles.modalDateSelected,
                          option.disabled && styles.modalDateDisabled,
                        ]}
                        disabled={option.disabled}
                        onPress={() => setRescheduleDate(option.value)}
                      >
                        <Text
                          style={[
                            styles.modalDateWeekday,
                            isSelected && styles.modalDateSelectedText,
                            option.disabled && styles.modalDateDisabledText,
                          ]}
                        >
                          {option.weekday}
                        </Text>
                        <Text
                          style={[
                            styles.modalDateText,
                            isSelected && styles.modalDateSelectedText,
                            option.disabled && styles.modalDateDisabledText,
                          ]}
                        >
                          {option.display}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
                {!dateOptions.some((option) => !option.disabled) && (
                  <Text style={[styles.modalInfo, styles.rtl]}>
                    אין תאריכים זמינים על פי ההגדרות הנוכחיות
                  </Text>
                )}

                <Text style={[styles.modalSectionTitle, styles.rtl]}>בחר שעה</Text>
                {availableHours.length ? (
                  <View style={styles.modalHoursContainer}>
                    {availableHours.map((slot) => {
                      const disabled = rescheduleBookedTimes.has(slot);
                      const selected = rescheduleTime === slot;
                      return (
                        <TouchableOpacity
                          key={slot}
                          style={[
                            styles.modalHourBtn,
                            selected && styles.modalHourSelected,
                            disabled && styles.modalHourDisabled,
                          ]}
                          disabled={disabled}
                          onPress={() => setRescheduleTime(slot)}
                        >
                          <Text
                            style={[
                              styles.modalHourText,
                              selected && styles.modalHourSelectedText,
                              disabled && styles.modalHourDisabledText,
                            ]}
                          >
                            {slot}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ) : (
                  <Text style={[styles.modalInfo, styles.rtl]}>
                    אין שעות פעילות לתאריך שבחרת
                  </Text>
                )}
              </>
            )}

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={closeRescheduleModal}
              >
                <Text style={styles.modalCancelText}>ביטול</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.modalConfirm,
                  (!rescheduleDate ||
                    !rescheduleTime ||
                    rescheduleBookedTimes.has(rescheduleTime) ||
                    rescheduleLoading ||
                    !rescheduleBusiness) && styles.modalConfirmDisabled,
                ]}
                onPress={handleReschedule}
                disabled={
                  !rescheduleDate ||
                  !rescheduleTime ||
                  rescheduleBookedTimes.has(rescheduleTime) ||
                  rescheduleLoading ||
                  !rescheduleBusiness
                }
              >
                <Text style={styles.modalConfirmText}>אשר דחייה</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  rtl: { textAlign: "right", writingDirection: "rtl" },
  container: { flex: 1 },

  // 🔹 כותרת
  header: {
    marginTop: 50,
    paddingHorizontal: 25,
    alignItems: "center",
    justifyContent: "center",
  },
  backBtn: {
    position: "absolute",
    left: 25,
    top: 0,
  },
  headerTitle: { fontSize: 22, fontWeight: "900", color: "#3e3e63" },

  // 🔹 תוכן
  card: {
    backgroundColor: "#fff",
    borderRadius: 20,
    marginHorizontal: 25,
    marginVertical: 10,
    padding: 20,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 6,
  },
  business: { fontSize: 20, fontWeight: "700", color: "#3e3e63" },
  detail: { marginTop: 5, fontSize: 15, color: "#555" },
  status: { marginTop: 8, fontWeight: "700", fontSize: 14 },
  approved: { color: "#2ecc71" },
  pending: { color: "#f39c12" },
  cancelled: { color: "#e74c3c" },
  rescheduled: { color: "#3498db" },
  buttonsRow: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    marginTop: 10,
  },
  cancelButton: {
    flex: 1,
    borderRadius: 25,
    borderColor: "#e74c3c",
    borderWidth: 1.5,
    paddingVertical: 8,
    alignItems: "center",
    marginHorizontal: 5,
  },
  cancelText: { color: "#e74c3c", fontWeight: "700" },
  rescheduleButton: {
    flex: 1,
    borderRadius: 25,
    borderColor: "#3498db",
    borderWidth: 1.5,
    paddingVertical: 8,
    alignItems: "center",
    marginHorizontal: 5,
  },
  rescheduleText: { color: "#3498db", fontWeight: "700" },
  noBookings: {
    textAlign: "center",
    color: "#666",
    marginTop: 100,
    fontSize: 16,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f5f7fa",
  },
  loadingText: { marginTop: 10, fontSize: 16, color: "#3e3e63" },

  // 🔹 Modal
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  modalBox: {
    width: "85%",
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 20,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 15,
    color: "#3e3e63",
  },
  modalLoading: {
    paddingVertical: 20,
    alignItems: "center",
  },
  modalInfo: {
    textAlign: "center",
    color: "#7c8095",
    fontWeight: "600",
    marginTop: 10,
  },
  modalSectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#3e3e63",
    marginTop: 5,
    marginBottom: 10,
  },
  modalDateScroll: {
    flexDirection: "row-reverse",
    paddingBottom: 6,
    paddingHorizontal: 2,
  },
  modalDateBtn: {
    width: 110,
    borderWidth: 1,
    borderColor: "#e0e3ef",
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: "#f9fafc",
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 5,
  },
  modalDateSelected: {
    backgroundColor: "#6C63FF",
    borderColor: "#6C63FF",
  },
  modalDateDisabled: {
    backgroundColor: "#f0f1f6",
    borderColor: "#e4e6f2",
  },
  modalDateWeekday: {
    color: "#6C63FF",
    fontSize: 12,
    fontWeight: "700",
  },
  modalDateText: {
    color: "#3e3e63",
    fontWeight: "700",
    fontSize: 14,
  },
  modalDateSelectedText: {
    color: "#fff",
  },
  modalDateDisabledText: {
    color: "#bcc1d6",
  },
  modalHoursContainer: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
  },
  modalHourBtn: {
    borderWidth: 1,
    borderColor: "#d9dbe8",
    borderRadius: 12,
    backgroundColor: "#fff",
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginLeft: 8,
    marginBottom: 10,
  },
  modalHourSelected: {
    backgroundColor: "#6C63FF",
    borderColor: "#6C63FF",
  },
  modalHourDisabled: {
    backgroundColor: "#eef0f7",
    borderColor: "#eef0f7",
  },
  modalHourText: {
    color: "#3e3e63",
    fontWeight: "700",
  },
  modalHourSelectedText: {
    color: "#fff",
  },
  modalHourDisabledText: {
    color: "#aab0c6",
  },
  modalButtons: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    marginTop: 15,
  },
  modalCancel: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: "#aaa",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
    marginHorizontal: 5,
  },
  modalCancelText: { color: "#555", fontWeight: "600" },
  modalConfirm: {
    flex: 1,
    backgroundColor: "#6C63FF",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
    marginHorizontal: 5,
  },
  modalConfirmText: { color: "#fff", fontWeight: "700" },
  modalConfirmDisabled: {
    backgroundColor: "#b9b6ff",
  },
});
