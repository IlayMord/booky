import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import {
    collection,
    doc,
    getDocs,
    query,
    updateDoc,
    where,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { auth, db } from "../firebaseConfig";

export default function MyBookings() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [rescheduleVisible, setRescheduleVisible] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [newDate, setNewDate] = useState(new Date());
  const [mode, setMode] = useState("date");
  const [showPicker, setShowPicker] = useState(false);
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
    if (!newDate) {
      Alert.alert("שגיאה", "אנא בחר תאריך ושעה חדשים");
      return;
    }

    const dateStr = newDate.toLocaleDateString("he-IL");
    const timeStr = newDate.toLocaleTimeString("he-IL", {
      hour: "2-digit",
      minute: "2-digit",
    });

    try {
      await updateDoc(doc(db, "appointments", selectedBooking.id), {
        date: dateStr,
        time: timeStr,
        status: "rescheduled",
      });
      Alert.alert("✅ עודכן", "התור נדחה בהצלחה");
      setRescheduleVisible(false);
      fetchBookings();
    } catch (error) {
      Alert.alert("שגיאה", error.message);
    }
  };

  const onChange = (event, selected) => {
    const currentDate = selected || newDate;
    setShowPicker(Platform.OS === "ios");
    setNewDate(currentDate);
  };

  const showMode = (currentMode) => {
    setShowPicker(true);
    setMode(currentMode);
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
          bookings.map((b) => (
            <View key={b.id} style={styles.card}>
              <Text style={[styles.business, styles.rtl]}>{b.businessName}</Text>
              <Text style={[styles.detail, styles.rtl]}>
                📅 {b.date} | ⏰ {b.time}
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
                      setSelectedBooking(b);
                      setRescheduleVisible(true);
                    }}
                  >
                    <Text style={styles.rescheduleText}>דחה תור</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ))
        )}
      </ScrollView>

      {/* 🔹 חלונית דחייה */}
      <Modal visible={rescheduleVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={[styles.modalTitle, styles.rtl]}>
              דחיית תור — {selectedBooking?.businessName}
            </Text>

            <TouchableOpacity
              style={styles.modalPickerBtn}
              onPress={() => showMode("date")}
            >
              <Text style={styles.modalPickerText}>
                בחר תאריך: {newDate.toLocaleDateString("he-IL")}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.modalPickerBtn}
              onPress={() => showMode("time")}
            >
              <Text style={styles.modalPickerText}>
                בחר שעה:{" "}
                {newDate.toLocaleTimeString("he-IL", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </Text>
            </TouchableOpacity>

            {showPicker && (
              <DateTimePicker
                value={newDate}
                mode={mode}
                is24Hour={true}
                display="default"
                onChange={onChange}
                locale="he-IL"
              />
            )}

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => setRescheduleVisible(false)}
              >
                <Text style={styles.modalCancelText}>ביטול</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalConfirm}
                onPress={handleReschedule}
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
  modalPickerBtn: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 15,
    marginVertical: 8,
  },
  modalPickerText: { fontSize: 15, color: "#333", textAlign: "right" },
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
});
