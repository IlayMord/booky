import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import InlineNotification from "../components/InlineNotification";
import { WEEK_DAYS, getWeekdayKeyFromDate } from "../constants/weekdays";
import { auth, db } from "../firebaseConfig";
import {
  formatBookingDateForDisplay,
  formatDateKey,
  formatDateLabel,
  getHoursUntilBooking,
  isBookingTimeElapsed,
  normaliseBookingDate,
  normaliseBookingTime,
} from "../utils/bookingDate";
import { syncAppointmentNotifications } from "../utils/pushNotifications";

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

const getStatusMeta = (booking) => {
  switch (booking?.status) {
    case "approved":
      return { label: "מאושר", background: "#e6f5ef", color: "#17874c" };
    case "pending":
      return { label: "ממתין לאישור", background: "#fff6e6", color: "#a86a00" };
    case "cancelled":
      return { label: "בוטל", background: "#ffe5e9", color: "#c62828" };
    case "rescheduled":
      return { label: "נדחה", background: "#e5ecff", color: "#3c4cd9" };
    default:
      return { label: "בתהליך", background: "#e8e9ff", color: "#4437a6" };
  }
};

const describeTiming = (booking) => {
  const hours = getHoursUntilBooking(booking);
  if (hours === null) {
    return "";
  }
  if (hours <= 0) {
    return "התור כבר החל או הסתיים";
  }
  if (hours < 1) {
    return "מתחיל ממש עכשיו";
  }
  if (hours < 24) {
    return `מתחיל בעוד כ-${Math.round(hours)} שעות`;
  }
  const days = Math.round(hours / 24);
  return days === 1 ? "מחר" : `בעוד ${days} ימים`;
};

const getExperienceImage = (booking) => {
  if (booking?.galleryImage?.uri) {
    return booking.galleryImage.uri;
  }
  if (typeof booking?.galleryImage === "string") {
    return booking.galleryImage;
  }
  if (booking?.selectedGalleryImage?.uri) {
    return booking.selectedGalleryImage.uri;
  }
  if (typeof booking?.selectedGalleryImage === "string") {
    return booking.selectedGalleryImage;
  }
  if (booking?.businessImage) {
    return booking.businessImage;
  }
  return null;
};

export default function MyBookings() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState(null);
  const [activeTab, setActiveTab] = useState("upcoming");
  const [rescheduleVisible, setRescheduleVisible] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [rescheduleBusiness, setRescheduleBusiness] = useState(null);
  const [rescheduleLoading, setRescheduleLoading] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");
  const [rescheduleBookedTimes, setRescheduleBookedTimes] = useState(new Set());
  const [notification, setNotification] = useState(null);
  const [cancellationCredit, setCancellationCredit] = useState(0);
  const router = useRouter();

  const showNotification = (type, message) => {
    setNotification({ type, message, id: Date.now() });
  };

  const fetchBookings = async () => {
    try {
      const user = auth.currentUser;
      if (!user) {
        setBookings([]);
        await syncAppointmentNotifications([], { enabled: false });
        return;
      }

      const appointmentsQuery = query(
        collection(db, "appointments"),
        where("userId", "==", user.uid)
      );
      const snapshot = await getDocs(appointmentsQuery);
      const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      setBookings(data);

      let pushEnabled = true;
      try {
        const userRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userRef);
        if (userDoc.exists()) {
          const preferences = userDoc.data()?.preferences || {};
          if (typeof preferences.pushNotifications === "boolean") {
            pushEnabled = preferences.pushNotifications;
          }
        }
      } catch (preferencesError) {
        console.error("Error fetching user preferences:", preferencesError);
      }

      try {
        await syncAppointmentNotifications(data, { enabled: pushEnabled });
      } catch (notificationError) {
        console.error("Error syncing appointment notifications:", notificationError);
      }
    } catch (error) {
      console.error("Error fetching bookings:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBookings();
  }, []);

  useEffect(() => {
    if (!rescheduleVisible || !selectedBooking?.businessId) {
      setRescheduleBusiness(null);
      return;
    }

    const loadBusiness = async () => {
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

    loadBusiness();
  }, [rescheduleVisible, selectedBooking?.businessId]);

  const originalBookingDate = useMemo(
    () => normaliseBookingDate(selectedBooking?.date),
    [selectedBooking?.date]
  );
  const originalBookingTime = useMemo(
    () => normaliseBookingTime(selectedBooking?.time),
    [selectedBooking?.time]
  );

  useEffect(() => {
    if (!rescheduleVisible) return;
    setRescheduleDate(originalBookingDate);
    setRescheduleTime(originalBookingTime);
  }, [originalBookingDate, originalBookingTime, rescheduleVisible]);

  const bookingWindowLimit = useMemo(
    () => clampBookingWindow(rescheduleBusiness?.bookingWindowDays),
    [rescheduleBusiness?.bookingWindowDays]
  );

  const bookingIntervalMinutes = useMemo(
    () => clampSlotInterval(rescheduleBusiness?.bookingIntervalMinutes),
    [rescheduleBusiness?.bookingIntervalMinutes]
  );

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

  const confirmCancel = (booking) => {
    Alert.alert(
      "ביטול תור",
      "האם לבטל את התור הקרוב?",
      [
        { text: "חזרה", style: "cancel" },
        {
          text: "בטל",
          style: "destructive",
          onPress: () => handleCancel(booking),
        },
      ]
    );
  };

  const handleCancel = async (booking) => {
    if (!booking?.id) {
      return;
    }

    try {
      await updateDoc(doc(db, "appointments", booking.id), {
        status: "cancelled",
        cancelledAt: serverTimestamp(),
        cancelledBy: auth.currentUser?.uid || null,
      });

      showNotification("success", "התור בוטל בהצלחה.");
      setBookings((prev) =>
        prev.map((item) =>
          item.id === booking.id ? { ...item, status: "cancelled" } : item
        )
      );
      fetchBookings();
    } catch (error) {
      showNotification("error", error.message || "לא הצלחנו לבטל את התור.");
    }
  };

  const handleReschedule = async () => {
    if (!selectedBooking) return;

    if (!rescheduleDate || !rescheduleTime) {
      showNotification("error", "אנא בחרי תאריך ושעה חדשים לתור");
      return;
    }

    const option = dateOptions.find((item) => item.value === rescheduleDate);
    if (!option || option.disabled) {
      showNotification("error", "התאריך שנבחר אינו זמין להזמנה");
      return;
    }

    if (!availableHours.includes(rescheduleTime)) {
      showNotification("error", "השעה שנבחרה אינה תואמת את שעות הפעילות");
      return;
    }

    if (rescheduleBookedTimes.has(rescheduleTime)) {
      showNotification("error", "השעה שנבחרה כבר נתפסה, בחרי שעה אחרת");
      return;
    }

    if (isBookingTimeElapsed(selectedBooking)) {
      showNotification("error", "לא ניתן לדחות תור שכבר התחיל או עבר");
      closeRescheduleModal();
      return;
    }

    try {
      await updateDoc(doc(db, "appointments", selectedBooking.id), {
        date: rescheduleDate,
        time: rescheduleTime,
        status: "rescheduled",
      });
      showNotification("success", "התור נדחה בהצלחה");
      closeRescheduleModal();
      fetchBookings();
    } catch (error) {
      showNotification("error", error.message || "לא הצלחנו לדחות את התור");
    }
  };

  const handleContact = async (booking) => {
    const phone = booking?.businessPhone || booking?.userPhone;
    if (!phone) {
      showNotification("info", "לבעל העסק אין מספר טלפון זמין במערכת");
      return;
    }
    try {
      await Linking.openURL(`tel:${phone}`);
    } catch (error) {
      console.error("Failed to launch phone dialer", error);
      showNotification("error", "לא הצלחנו לפתוח את חיוג הטלפון.");
    }
  };

  const openReschedule = (booking) => {
    setSelectedBooking(booking);
    setRescheduleVisible(true);
  };

  const upcomingBookings = useMemo(
    () =>
      bookings.filter(
        (booking) =>
          booking.status !== "cancelled" && !isBookingTimeElapsed(booking)
      ),
    [bookings]
  );

  const historyBookings = useMemo(
    () =>
      bookings.filter(
        (booking) => booking.status === "cancelled" || isBookingTimeElapsed(booking)
      ),
    [bookings]
  );

  const pendingCount = useMemo(
    () => bookings.filter((booking) => booking.status === "pending").length,
    [bookings]
  );

  const upcomingCount = upcomingBookings.length;
  const historyCount = historyBookings.length;

  const activeList = activeTab === "history" ? historyBookings : upcomingBookings;

  const renderBookingCard = (booking) => {
    const statusMeta = getStatusMeta(booking);
    const experienceImage = getExperienceImage(booking);
    const timingText = describeTiming(booking);
    const canModify =
      booking.status !== "cancelled" && !isBookingTimeElapsed(booking);
    const canReschedule = canModify && booking.status !== "pending";
    const canCancel = canModify;

    return (
      <View key={booking.id} style={styles.bookingCard}>
        <View style={styles.bookingHeader}>
          <View style={styles.bookingHeaderText}>
            <Text style={styles.bookingBusiness}>{booking.businessName}</Text>
            <Text style={styles.bookingTime}>
              {formatBookingDateForDisplay(booking.date)} • {normaliseBookingTime(booking.time)}
            </Text>
          </View>
          <View
            style={[styles.statusPill, { backgroundColor: statusMeta.background }]}
          >
            <Text style={[styles.statusText, { color: statusMeta.color }]}>
              {statusMeta.label}
            </Text>
          </View>
        </View>

        {experienceImage ? (
          <Image source={{ uri: experienceImage }} style={styles.bookingImage} />
        ) : (
          <View style={styles.bookingImagePlaceholder}>
            <Ionicons name="image-outline" size={36} color="#a1a7c8" />
          </View>
        )}

        {booking.notes ? (
          <Text style={styles.bookingNotes} numberOfLines={2}>
            {booking.notes}
          </Text>
        ) : null}

        {timingText ? (
          <View style={styles.bookingMetaRow}>
            <Ionicons name="time-outline" size={16} color="#6C63FF" />
            <Text style={styles.bookingMetaText}>{timingText}</Text>
          </View>
        ) : null}

        <View style={styles.bookingActionsRow}>
          <TouchableOpacity
            style={[styles.actionButton, styles.actionSecondary]}
            onPress={() => handleContact(booking)}
          >
            <Ionicons name="chatbubbles-outline" size={16} color="#6C63FF" />
            <Text style={styles.actionSecondaryText}>צור קשר</Text>
          </TouchableOpacity>
          {canReschedule && (
            <TouchableOpacity
              style={[styles.actionButton, styles.actionPrimary]}
              onPress={() => openReschedule(booking)}
            >
              <Ionicons name="calendar-outline" size={16} color="#fff" />
              <Text style={styles.actionPrimaryText}>דחי תור</Text>
            </TouchableOpacity>
          )}
          {canCancel && (
            <TouchableOpacity
              style={[styles.actionButton, styles.actionDanger]}
              onPress={() => confirmCancel(booking)}
            >
              <Ionicons name="close-circle-outline" size={16} color="#fff" />
              <Text style={styles.actionPrimaryText}>בטל</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
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
      <View style={styles.notificationWrapper} pointerEvents="box-none">
        <InlineNotification
          key={notification?.id || "bookingsNotification"}
          visible={Boolean(notification?.message)}
          type={notification?.type}
          message={notification?.message}
          onClose={() => setNotification(null)}
        />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.heroCard}>
          <TouchableOpacity
            style={styles.heroBack}
            onPress={() => router.replace("/")}
          >
            <Ionicons name="arrow-back" size={20} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.heroTitle}>התורים שלי</Text>
          <Text style={styles.heroSubtitle}>
            עקבי אחרי הלו&quot;ז שלך, עם חוויית ניהול אולטרה מודרנית
          </Text>
          <View style={styles.heroStatsRow}>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatValue}>{upcomingCount}</Text>
              <Text style={styles.heroStatLabel}>תורים קרובים</Text>
            </View>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatValue}>{pendingCount}</Text>
              <Text style={styles.heroStatLabel}>ממתינים לאישור</Text>
            </View>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatValue}>{historyCount}</Text>
              <Text style={styles.heroStatLabel}>תורים עברו</Text>
            </View>
          </View>
        </View>

        <View style={styles.segmentRow}>
          <TouchableOpacity
            style={[styles.segmentButton, activeTab === "upcoming" && styles.segmentButtonActive]}
            onPress={() => setActiveTab("upcoming")}
          >
            <Text
              style={[styles.segmentText, activeTab === "upcoming" && styles.segmentTextActive]}
            >
              קרובים
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.segmentButton, activeTab === "history" && styles.segmentButtonActive]}
            onPress={() => setActiveTab("history")}
          >
            <Text
              style={[styles.segmentText, activeTab === "history" && styles.segmentTextActive]}
            >
              היסטוריה
            </Text>
          </TouchableOpacity>
        </View>

        {activeList.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="calendar-clear-outline" size={48} color="#b4bbd6" />
            <Text style={styles.emptyTitle}>
              {activeTab === "upcoming"
                ? "אין לך תורים קרובים"
                : "עוד לא נבנתה היסטוריה"}
            </Text>
            <Text style={styles.emptySubtitle}>
              {activeTab === "upcoming"
                ? "גלי עסקים חדשים וקבעי תור ראשון כבר היום"
                : "כשתסיימי תור, הוא יופיע כאן עם כל הפרטים"}
            </Text>
            <TouchableOpacity
              style={styles.emptyAction}
              onPress={() => router.replace("/")}
            >
              <Ionicons name="search-outline" size={18} color="#fff" />
              <Text style={styles.emptyActionText}>חיפוש עסק</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.list}>
            {activeList.map(renderBookingCard)}
          </View>
        )}
      </ScrollView>

      <Modal
        visible={rescheduleVisible}
        animationType="slide"
        transparent
        onRequestClose={closeRescheduleModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>דחיית תור</Text>
            <Text style={styles.modalSubtitle}>
              בחרי יום ושעה חדשים – אנחנו נעדכן את העסק עבורך
            </Text>

            {rescheduleLoading && (
              <View style={styles.modalLoading}>
                <ActivityIndicator color="#6C63FF" />
                <Text style={styles.modalLoadingText}>טוען שעות פעילות...</Text>
              </View>
            )}

            {rescheduleBusiness && (
              <>
                <Text style={styles.modalSectionTitle}>בחרי תאריך</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.modalDatesRow}
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
                  <Text style={styles.modalInfo}>
                    אין תאריכים זמינים על פי ההגדרות הנוכחיות
                  </Text>
                )}

                <Text style={styles.modalSectionTitle}>בחרי שעה</Text>
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
                  <Text style={styles.modalInfo}>אין שעות פעילות לתאריך שבחרת</Text>
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
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f5f7fa",
  },
  loadingText: {
    marginTop: 12,
    color: "#5b6473",
    fontWeight: "600",
  },
  notificationWrapper: {
    position: "absolute",
    top: 50,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    zIndex: 20,
  },
  scrollContent: {
    paddingBottom: 120,
  },
  heroCard: {
    marginTop: 60,
    marginHorizontal: 20,
    backgroundColor: "#1f1b5c",
    borderRadius: 24,
    padding: 22,
    overflow: "hidden",
  },
  heroBack: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-start",
  },
  heroTitle: {
    marginTop: 18,
    fontSize: 22,
    fontWeight: "800",
    color: "#fff",
    textAlign: "right",
  },
  heroSubtitle: {
    marginTop: 8,
    color: "rgba(255,255,255,0.75)",
    fontSize: 14,
    lineHeight: 20,
    textAlign: "right",
  },
  heroStatsRow: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    marginTop: 20,
  },
  heroStat: {
    flex: 1,
    marginHorizontal: 4,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: "center",
  },
  heroStatValue: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 20,
  },
  heroStatLabel: {
    color: "rgba(255,255,255,0.7)",
    marginTop: 4,
    fontSize: 12,
  },
  segmentRow: {
    flexDirection: "row",
    marginTop: 24,
    marginHorizontal: 20,
    backgroundColor: "#e6e8f8",
    borderRadius: 20,
    padding: 6,
  },
  segmentButton: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 10,
    alignItems: "center",
  },
  segmentButtonActive: {
    backgroundColor: "#fff",
    elevation: 2,
  },
  segmentText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#6b6f91",
  },
  segmentTextActive: {
    color: "#1f1b5c",
  },
  list: {
    marginTop: 18,
    paddingHorizontal: 20,
    gap: 16,
  },
  bookingCard: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 18,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
  },
  bookingHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  bookingHeaderText: {
    flex: 1,
    marginRight: 12,
  },
  bookingBusiness: {
    fontSize: 18,
    fontWeight: "800",
    color: "#1f1b5c",
    textAlign: "right",
  },
  bookingTime: {
    marginTop: 4,
    fontSize: 13,
    color: "#6b6f91",
    textAlign: "right",
  },
  statusPill: {
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "700",
  },
  bookingImage: {
    marginTop: 14,
    width: "100%",
    height: 160,
    borderRadius: 16,
  },
  bookingImagePlaceholder: {
    marginTop: 14,
    width: "100%",
    height: 160,
    borderRadius: 16,
    backgroundColor: "#f0f1f9",
    alignItems: "center",
    justifyContent: "center",
  },
  bookingNotes: {
    marginTop: 14,
    fontSize: 13,
    color: "#4f5472",
    textAlign: "right",
  },
  bookingMetaRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    marginTop: 12,
  },
  bookingMetaText: {
    color: "#6C63FF",
    fontWeight: "700",
    fontSize: 13,
  },
  bookingActionsRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    marginTop: 18,
    gap: 10,
    flexWrap: "wrap",
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 16,
    gap: 6,
  },
  actionPrimary: {
    backgroundColor: "#6C63FF",
  },
  actionDanger: {
    backgroundColor: "#ef5350",
  },
  actionSecondary: {
    backgroundColor: "#eef0ff",
  },
  actionPrimaryText: {
    color: "#fff",
    fontWeight: "700",
  },
  actionSecondaryText: {
    color: "#4c4f75",
    fontWeight: "700",
  },
  emptyState: {
    marginTop: 40,
    marginHorizontal: 32,
    borderRadius: 24,
    backgroundColor: "#fff",
    padding: 32,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e4e7fb",
  },
  emptyTitle: {
    marginTop: 18,
    fontSize: 18,
    fontWeight: "800",
    color: "#1f1b5c",
    textAlign: "center",
  },
  emptySubtitle: {
    marginTop: 10,
    color: "#6b6f91",
    textAlign: "center",
    lineHeight: 20,
  },
  emptyAction: {
    marginTop: 20,
    backgroundColor: "#6C63FF",
    borderRadius: 20,
    paddingVertical: 12,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  emptyActionText: {
    color: "#fff",
    fontWeight: "700",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 32,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#1f1b5c",
    textAlign: "right",
  },
  modalSubtitle: {
    marginTop: 6,
    color: "#6b6f91",
    fontSize: 13,
    textAlign: "right",
  },
  modalLoading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 16,
  },
  modalLoadingText: {
    color: "#6b6f91",
    fontSize: 13,
  },
  modalSectionTitle: {
    marginTop: 24,
    fontWeight: "800",
    fontSize: 15,
    color: "#1f1b5c",
    textAlign: "right",
  },
  modalDatesRow: {
    flexDirection: "row-reverse",
    marginTop: 16,
    gap: 12,
  },
  modalDateBtn: {
    width: 110,
    backgroundColor: "#f1f2fb",
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: "center",
  },
  modalDateSelected: {
    backgroundColor: "#6C63FF",
  },
  modalDateDisabled: {
    backgroundColor: "#eff0f4",
    opacity: 0.55,
  },
  modalDateWeekday: {
    fontSize: 12,
    color: "#6C63FF",
    fontWeight: "700",
  },
  modalDateText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1f1b5c",
  },
  modalDateSelectedText: {
    color: "#fff",
  },
  modalDateDisabledText: {
    color: "#9ea3bf",
  },
  modalInfo: {
    marginTop: 18,
    textAlign: "center",
    color: "#6b6f91",
  },
  modalHoursContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 16,
  },
  modalHourBtn: {
    width: 92,
    borderRadius: 14,
    paddingVertical: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#dfe3f5",
    backgroundColor: "#fff",
  },
  modalHourSelected: {
    backgroundColor: "#6C63FF",
    borderColor: "#6C63FF",
  },
  modalHourDisabled: {
    opacity: 0.4,
  },
  modalHourText: {
    fontWeight: "700",
    color: "#1f1b5c",
  },
  modalHourSelectedText: {
    color: "#fff",
  },
  modalHourDisabledText: {
    color: "#8c91ad",
  },
  modalButtons: {
    flexDirection: "row",
    marginTop: 26,
    gap: 12,
  },
  modalCancel: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#dfe3f5",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
  },
  modalCancelText: {
    color: "#6b6f91",
    fontWeight: "700",
  },
  modalConfirm: {
    flex: 1,
    borderRadius: 16,
    backgroundColor: "#6C63FF",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
  },
  modalConfirmDisabled: {
    opacity: 0.4,
  },
  modalConfirmText: {
    color: "#fff",
    fontWeight: "700",
  },
});
