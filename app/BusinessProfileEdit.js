import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  DateTimePickerAndroid,
  default as DateTimePicker,
} from "@react-native-community/datetimepicker";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { auth, db } from "../firebaseConfig";
import {
  WEEK_DAYS,
  createEmptyWeeklyHours,
  sanitizeWeeklyHours,
} from "../constants/weekdays";

const BOOKING_WINDOW_PRESETS = [7, 14, 21, 30];

const timeToMinutes = (time) => {
  if (!/^\d{2}:\d{2}$/.test(time)) return NaN;
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
};

export default function BusinessProfileEdit() {
  const [business, setBusiness] = useState({
    name: "",
    phone: "",
    address: "",
    category: "",
    description: "",
    image: "",
    autoApprove: false,
  });
  const [weeklyHours, setWeeklyHours] = useState(createEmptyWeeklyHours());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activePicker, setActivePicker] = useState(null);
  const [iosPickerValue, setIosPickerValue] = useState(new Date());
  const [bookingWindowDays, setBookingWindowDays] = useState(30);
  const [bookingWindowInput, setBookingWindowInput] = useState("30");
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const parseFallbackHours = (data) => {
    let openingHour = data.openingHour || "";
    let closingHour = data.closingHour || "";

    if ((!openingHour || !closingHour) && typeof data.hours === "string") {
      const match = data.hours.match(/(\d{2}:\d{2}).*?(\d{2}:\d{2})/);
      if (match) {
        openingHour = openingHour || match[1];
        closingHour = closingHour || match[2];
      }
    }

    return { openingHour, closingHour };
  };

  const applyFallbackToWeekly = (hoursMap, fallback) => {
    const { openingHour, closingHour } = fallback;
    if (!openingHour || !closingHour) {
      return hoursMap;
    }

    const updated = { ...hoursMap };
    WEEK_DAYS.forEach((day) => {
      updated[day.key] = {
        open: openingHour,
        close: closingHour,
        closed: false,
      };
    });
    return updated;
  };

  useEffect(() => {
    const fetchBusiness = async () => {
      try {
        const user = auth.currentUser;
        if (!user) return;
        const ref = doc(db, "businesses", user.uid);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const data = snap.data();
          const fallbackHours = parseFallbackHours(data);
          const sanitized = sanitizeWeeklyHours(data.weeklyHours);
          const hasAnyWeekly = Object.values(sanitized).some((day) =>
            day.open || day.close
          );

          setWeeklyHours(
            hasAnyWeekly
              ? sanitized
              : applyFallbackToWeekly(sanitized, fallbackHours)
          );

          setBusiness((prev) => ({
            ...prev,
            ...data,
            autoApprove: data.autoApprove ?? false,
          }));

          const parsedWindow = Number(data.bookingWindowDays);
          const sanitizedWindow = Number.isFinite(parsedWindow)
            ? Math.min(Math.max(Math.round(parsedWindow), 1), 90)
            : 30;
          setBookingWindowDays(sanitizedWindow);
          setBookingWindowInput(String(sanitizedWindow));
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

  const getInitialTimeValue = (time) => {
    const base = new Date();
    base.setSeconds(0, 0);
    if (/^\d{2}:\d{2}$/.test(time)) {
      const [h, m] = time.split(":").map(Number);
      base.setHours(h, m, 0, 0);
    } else {
      base.setHours(9, 0, 0, 0);
    }
    return base;
  };

  const updateWeeklyHour = (dayKey, field, date) => {
    if (!date) return;
    const hours = `${String(date.getHours()).padStart(2, "0")}:${String(
      date.getMinutes()
    ).padStart(2, "0")}`;
    setWeeklyHours((prev) => ({
      ...prev,
      [dayKey]: {
        ...prev[dayKey],
        [field]: hours,
        closed: false,
      },
    }));
  };

  const openTimePicker = (dayKey, field) => {
    const currentValue = weeklyHours[dayKey]?.[field];
    const initialDate = getInitialTimeValue(currentValue);

    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        mode: "time",
        is24Hour: true,
        display: "spinner",
        value: initialDate,
        onChange: (_, selectedDate) => {
          if (selectedDate) {
            updateWeeklyHour(dayKey, field, selectedDate);
          }
        },
      });
      return;
    }

    setIosPickerValue(initialDate);
    setActivePicker({ dayKey, field });
  };

  const closeIosPicker = () => {
    setActivePicker(null);
  };

  const confirmIosPicker = () => {
    if (activePicker) {
      updateWeeklyHour(activePicker.dayKey, activePicker.field, iosPickerValue);
    }
    closeIosPicker();
  };

  const handleSave = async () => {
    const user = auth.currentUser;
    if (!user) return Alert.alert("שגיאה", "אין משתמש מחובר");
    if (!business.name.trim()) return Alert.alert("שגיאה", "יש להזין שם עסק");

    const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;
    const errors = [];
    const validatedWeekly = {};
    WEEK_DAYS.forEach((day) => {
      const config = weeklyHours[day.key] || {};
      const closed = Boolean(config.closed);
      const open = config.open || "";
      const close = config.close || "";

      if (!closed) {
        if (!timeRegex.test(open) || !timeRegex.test(close)) {
          errors.push(`יש להזין שעות תקינות עבור ${day.label}`);
        } else if (!(timeToMinutes(open) < timeToMinutes(close))) {
          errors.push(`שעת הסגירה חייבת להיות מאוחרת מהפתיחה עבור ${day.label}`);
        }
      }

      validatedWeekly[day.key] = { open, close, closed };
    });

    if (!Number.isInteger(bookingWindowDays) || bookingWindowDays < 1) {
      errors.push("יש להזין מספר ימים תקין לטווח קביעת התורים");
    }

    if (bookingWindowDays > 90) {
      errors.push("ניתן להגדיר עד 90 ימים קדימה לפתיחת יומן התורים");
    }

    if (errors.length) {
      Alert.alert("שגיאה", errors[0]);
      return;
    }

    const firstOpenDay = WEEK_DAYS.find((day) => {
      const config = validatedWeekly[day.key];
      return config && !config.closed && config.open && config.close;
    });

    const openingHour = firstOpenDay ? validatedWeekly[firstOpenDay.key].open : "";
    const closingHour = firstOpenDay ? validatedWeekly[firstOpenDay.key].close : "";

    const weeklySummary = WEEK_DAYS.map((day) => {
      const config = validatedWeekly[day.key];
      if (!config || config.closed) {
        return `${day.shortLabel}: סגור`;
      }
      if (!config.open || !config.close) {
        return `${day.shortLabel}: -`;
      }
      return `${day.shortLabel}: ${config.open} – ${config.close}`;
    }).join("  •  ");

    try {
      setSaving(true);
      const payload = {
        name: business.name,
        phone: business.phone,
        address: business.address,
        category: business.category,
        description: business.description,
        hours: weeklySummary,
        openingHour,
        closingHour,
        image: business.image,
        autoApprove: business.autoApprove,
        weeklyHours: validatedWeekly,
        bookingWindowDays,
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

  const weeklyPreview = useMemo(() => {
    const parts = WEEK_DAYS.map((day) => {
      const config = weeklyHours[day.key];
      if (!config || config.closed) {
        return `${day.shortLabel}: סגור`;
      }
      if (!config.open || !config.close) {
        return `${day.shortLabel}: -`;
      }
      return `${day.shortLabel}: ${config.open} – ${config.close}`;
    });
    return parts.join("  •  ");
  }, [weeklyHours]);

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
        <Text style={styles.hoursSubtitle}>{weeklyPreview}</Text>

        {WEEK_DAYS.map((day) => {
          const config = weeklyHours[day.key];
          const closed = config?.closed;
          return (
            <View key={day.key} style={styles.dayCard}>
              <View style={styles.dayHeader}>
                <Text style={styles.dayLabel}>{day.label}</Text>
                <View style={styles.daySwitchRow}>
                  <Text style={styles.daySwitchLabel}>סגור</Text>
                  <Switch
                    value={closed}
                    onValueChange={(value) =>
                      setWeeklyHours((prev) => ({
                        ...prev,
                        [day.key]: {
                          ...prev[day.key],
                          closed: value,
                        },
                      }))
                    }
                    trackColor={{ false: "#ccc", true: "#6C63FF" }}
                    thumbColor={closed ? "#fff" : "#888"}
                  />
                </View>
              </View>

              {closed ? (
                <Text style={styles.closedText}>היום מוגדר כיום מנוחה</Text>
              ) : (
                <View style={styles.timeRow}>
                  <TouchableOpacity
                    style={styles.timePickerBtn}
                    onPress={() => openTimePicker(day.key, "open")}
                  >
                    <Text style={styles.timePickerLabel}>שעת פתיחה</Text>
                    <Text style={styles.timePickerValue}>
                      {config?.open || "בחרו שעה"}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.timePickerBtn}
                    onPress={() => openTimePicker(day.key, "close")}
                  >
                    <Text style={styles.timePickerLabel}>שעת סגירה</Text>
                    <Text style={styles.timePickerValue}>
                      {config?.close || "בחרו שעה"}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        })}
      </View>

      <View style={styles.bookingWindowCard}>
        <Text style={styles.bookingWindowTitle}>טווח פתיחת תורים</Text>
        <Text style={styles.bookingWindowSubtitle}>
          כמה ימים קדימה הלקוחות יכולים לקבוע תור (מתעדכן בכל יום מחדש)
        </Text>
        <View style={styles.bookingWindowPresets}>
          {BOOKING_WINDOW_PRESETS.map((days) => {
            const isSelected = bookingWindowDays === days;
            return (
              <TouchableOpacity
                key={days}
                style={[
                  styles.bookingWindowChip,
                  isSelected && styles.bookingWindowChipSelected,
                ]}
                onPress={() => {
                  setBookingWindowDays(days);
                  setBookingWindowInput(String(days));
                }}
              >
                <Text
                  style={[
                    styles.bookingWindowChipText,
                    isSelected && styles.bookingWindowChipTextSelected,
                  ]}
                >
                  {days} ימים
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <View style={styles.bookingWindowCustomRow}>
          <Text style={styles.bookingWindowCustomLabel}>
            או הזן מספר ימים מותאם אישית (עד 90)
          </Text>
          <TextInput
            style={styles.bookingWindowInput}
            keyboardType="number-pad"
            value={bookingWindowInput}
            onChangeText={(value) => {
              const digits = value.replace(/[^0-9]/g, "");
              setBookingWindowInput(digits);
              const parsed = parseInt(digits, 10);
              if (Number.isFinite(parsed)) {
                setBookingWindowDays(parsed);
              } else {
                setBookingWindowDays(0);
              }
            }}
            placeholder="30"
            maxLength={3}
          />
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

      {Platform.OS === "ios" && activePicker && (
        <Modal transparent animationType="fade" visible>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>
                {`בחירת שעה עבור ${
                  WEEK_DAYS.find((day) => day.key === activePicker.dayKey)?.label || ""
                }`}
              </Text>
              <DateTimePicker
                mode="time"
                value={iosPickerValue}
                onChange={(_, date) => {
                  if (date) setIosPickerValue(date);
                }}
                display="spinner"
                locale="he-IL"
                themeVariant="light"
                textColor="#111827"
              />
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalCancel]}
                  onPress={closeIosPicker}
                >
                  <Text style={styles.modalCancelText}>ביטול</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalConfirm]}
                  onPress={confirmIosPicker}
                >
                  <Text style={styles.modalConfirmText}>שמור</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
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
    gap: 12,
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
    fontSize: 12,
  },
  dayCard: {
    backgroundColor: "#f7f8fc",
    borderRadius: 14,
    padding: 14,
    gap: 12,
  },
  dayHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dayLabel: {
    fontSize: 16,
    fontWeight: "700",
    color: "#333",
  },
  daySwitchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  daySwitchLabel: {
    color: "#555",
    fontWeight: "600",
  },
  closedText: {
    textAlign: "right",
    color: "#999",
    fontStyle: "italic",
  },
  timeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  timePickerBtn: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#e0e3ef",
  },
  timePickerLabel: {
    color: "#666",
    fontSize: 12,
    textAlign: "right",
  },
  timePickerValue: {
    marginTop: 4,
    fontSize: 16,
    fontWeight: "700",
    color: "#333",
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
  bookingWindowCard: {
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 18,
    marginTop: 24,
    gap: 14,
    borderWidth: 1,
    borderColor: "#eef1fb",
  },
  bookingWindowTitle: {
    fontSize: 18,
    fontWeight: "800",
    textAlign: "right",
    color: "#333",
  },
  bookingWindowSubtitle: {
    textAlign: "right",
    color: "#666",
    lineHeight: 20,
  },
  bookingWindowPresets: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: 10,
  },
  bookingWindowChip: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#d6dbf5",
    backgroundColor: "#f6f7ff",
  },
  bookingWindowChipSelected: {
    backgroundColor: "#6C63FF",
    borderColor: "#6C63FF",
  },
  bookingWindowChipText: {
    color: "#4a4f66",
    fontWeight: "700",
  },
  bookingWindowChipTextSelected: {
    color: "#fff",
  },
  bookingWindowCustomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  bookingWindowCustomLabel: {
    flex: 1,
    textAlign: "right",
    color: "#444",
    fontWeight: "600",
  },
  bookingWindowInput: {
    width: 80,
    backgroundColor: "#f4f6ff",
    borderRadius: 12,
    paddingVertical: 10,
    textAlign: "center",
    borderWidth: 1,
    borderColor: "#dce1f6",
    fontWeight: "700",
    color: "#333",
  },
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
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center",
    padding: 24,
  },
  modalContent: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 20,
    gap: 16,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#333",
    textAlign: "center",
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  modalCancel: {
    backgroundColor: "#f0f1f6",
  },
  modalConfirm: {
    backgroundColor: "#6C63FF",
  },
  modalCancelText: {
    color: "#555",
    fontWeight: "700",
  },
  modalConfirmText: {
    color: "#fff",
    fontWeight: "700",
  },
});
