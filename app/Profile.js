import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { signOut, updateEmail, updatePassword } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Image,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import Animated, { FadeInUp } from "react-native-reanimated";
import { auth, db } from "../firebaseConfig";
import InlineNotification from "../components/InlineNotification";
import {
  defaultAvatarId,
  getAvatarSource,
  isValidAvatarId,
  presetAvatars,
} from "../constants/profileAvatars";

const defaultPreferences = {
  pushNotifications: true,
  smsReminders: false,
  calendarSync: true,
};

export default function Profile() {
  const [userData, setUserData] = useState({
    preferences: { ...defaultPreferences },
    avatar: defaultAvatarId,
  });
  const [editing, setEditing] = useState(false);
  const [passwordMode, setPasswordMode] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [avatarModalVisible, setAvatarModalVisible] = useState(false);
  const [notification, setNotification] = useState(null);
  const router = useRouter();

  const showNotification = (type, message) => {
    setNotification({ type, message, id: Date.now() });
  };

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const user = auth.currentUser;
        if (user) {
          const ref = doc(db, "users", user.uid);
          const snap = await getDoc(ref);
          if (snap.exists()) {
            const data = snap.data();
            const mergedPreferences = {
              ...defaultPreferences,
              ...(data.preferences || {}),
            };
            const avatarId = isValidAvatarId(data.avatar)
              ? data.avatar
              : defaultAvatarId;
            setUserData({
              ...data,
              avatar: avatarId,
              preferences: mergedPreferences,
            });
          } else {
            setUserData({
              email: user.email,
              preferences: { ...defaultPreferences },
              avatar: defaultAvatarId,
            });
          }
        }
      } catch (error) {
        console.error("Error fetching user:", error);
      }
      setLoading(false);
    };
    fetchUser();
  }, []);

  const handleSelectPresetAvatar = async (avatarId) => {
    try {
      setUploading(true);
      const user = auth.currentUser;
      const ref = doc(db, "users", user.uid);
      setUserData((prev) => ({ ...prev, avatar: avatarId }));
      await setDoc(ref, { avatar: avatarId }, { merge: true });
      const selectedAvatar = presetAvatars.find((item) => item.id === avatarId);
      showNotification(
        "success",
        selectedAvatar?.label || "תמונת הפרופיל עודכנה בהצלחה"
      );
    } catch (error) {
      showNotification("error", error.message || "אירעה שגיאה בעת עדכון התמונה");
    } finally {
      setUploading(false);
      setAvatarModalVisible(false);
    }
  };

  const openAvatarModal = () => setAvatarModalVisible(true);
  const closeAvatarModal = () => {
    if (!uploading) {
      setAvatarModalVisible(false);
    }
  };

  const preferences = useMemo(
    () => ({
      ...defaultPreferences,
      ...(userData.preferences || {}),
    }),
    [userData]
  );

  const resolvedAvatarId = isValidAvatarId(userData.avatar)
    ? userData.avatar
    : defaultAvatarId;

  const togglePreference = async (key) => {
    const updatedPreferences = {
      ...preferences,
      [key]: !preferences[key],
    };
    setUserData((prev) => ({
      ...prev,
      preferences: updatedPreferences,
    }));

    try {
      const user = auth.currentUser;
      await setDoc(
        doc(db, "users", user.uid),
        {
          preferences: updatedPreferences,
        },
        { merge: true }
      );
      const label =
        key === "pushNotifications"
          ? "התראות דחיפה"
          : key === "smsReminders"
          ? "תזכורות SMS"
          : "סנכרון יומן";
      showNotification(
        "success",
        `${label} ${updatedPreferences[key] ? "הופעלו" : "כובו"}`
      );
    } catch (error) {
      console.error("Failed to update preferences:", error);
      showNotification("error", "לא הצלחנו לעדכן את ההעדפה, נסי שוב.");
      setUserData((prev) => ({
        ...prev,
        preferences,
      }));
    }
  };

  const creationTime = auth.currentUser?.metadata?.creationTime;
  const lastLoginTime = auth.currentUser?.metadata?.lastSignInTime;

  const formatDate = (value) => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleDateString("he-IL", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  const insights = useMemo(
    () => [
      {
        id: "bookings",
        label: "תורים קרובים",
        value: userData?.metrics?.upcoming || userData?.upcomingCount || 0,
      },
      {
        id: "favorites",
        label: "עסקים שמורים",
        value: userData?.favoritesCount || userData?.favorites?.length || 0,
      },
      {
        id: "history",
        label: "תורים שבוצעו",
        value: userData?.metrics?.completed || userData?.completedCount || 0,
      },
    ],
    [userData]
  );

  const accountDetails = useMemo(
    () => [
      { id: "since", label: "חבר מאז", value: formatDate(creationTime) },
      { id: "lastLogin", label: "כניסה אחרונה", value: formatDate(lastLoginTime) },
    ],
    [creationTime, lastLoginTime]
  );

  const statCards = useMemo(
    () => [...accountDetails, ...insights],
    [accountDetails, insights]
  );

  const handleInviteFriend = () => {
    showNotification("info", "שיתוף בוצע! שלחי לחברים את הלינק של Booky");
  };

  const handleSupport = () => {
    showNotification("info", "צוות התמיכה מחכה לך בכתובת support@booky.app");
  };

  const handleSave = async () => {
    try {
      const user = auth.currentUser;
      const ref = doc(db, "users", user.uid);
      await setDoc(ref, userData, { merge: true });

      if (userData.email && userData.email !== user.email) {
        await updateEmail(user, userData.email);
      }

      showNotification("success", "הפרטים שלך נשמרו בהצלחה");
      setEditing(false);
    } catch (error) {
      showNotification("error", error.message || "לא הצלחנו לעדכן את הפרופיל");
    }
  };

  const handlePasswordChange = async () => {
    if (!newPassword || newPassword.length < 6) {
      showNotification("error", "הסיסמה חייבת להכיל לפחות 6 תווים");
      return;
    }
    try {
      await updatePassword(auth.currentUser, newPassword);
      showNotification("success", "הסיסמה שלך הוחלפה בהצלחה");
      setPasswordMode(false);
      setNewPassword("");
    } catch (error) {
      showNotification("error", error.message || "לא הצלחנו לעדכן את הסיסמה");
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    router.replace("/Login");
  };

  if (loading)
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#6C63FF" />
        <Text style={styles.loadingText}>טוען פרופיל...</Text>
      </View>
    );

  return (
    <LinearGradient colors={["#6C63FF", "#48C6EF"]} style={{ flex: 1 }}>
      <View style={styles.notificationWrapper} pointerEvents="box-none">
        <InlineNotification
          key={notification?.id || "profileNotification"}
          visible={Boolean(notification?.message)}
          type={notification?.type}
          message={notification?.message}
          onClose={() => setNotification(null)}
        />
      </View>
      <Modal
        visible={avatarModalVisible}
        animationType="slide"
        transparent
        onRequestClose={closeAvatarModal}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeAvatarModal} />
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>בחרו תמונת פרופיל</Text>
              <Text style={styles.modalSubtitle}>
                בחרי דמות מאוירת מהמאגרים הקבועים של Booky
              </Text>
            </View>
            <View style={styles.avatarGrid}>
              {presetAvatars.map((avatar) => {
                const isSelected = resolvedAvatarId === avatar.id;
                return (
                  <TouchableOpacity
                    key={avatar.id}
                    style={[
                      styles.avatarOption,
                      isSelected && styles.avatarOptionSelected,
                    ]}
                    onPress={() => handleSelectPresetAvatar(avatar.id)}
                    disabled={uploading}
                    activeOpacity={0.85}
                  >
                    <Image source={avatar.source} style={styles.avatarOptionImage} />
                  </TouchableOpacity>
                );
              })}
            </View>
            {uploading && (
              <View style={styles.modalLoading}>
                <ActivityIndicator color="#6C63FF" />
                <Text style={styles.modalLoadingText}>מעדכן תמונה...</Text>
              </View>
            )}
            <TouchableOpacity
              onPress={closeAvatarModal}
              style={styles.modalClose}
              disabled={uploading}
            >
              <Text style={styles.modalCloseText}>סגור</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      <ScrollView
        contentContainerStyle={[
          styles.container,
          notification?.message && styles.containerShifted,
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* 🔹 Back Button */}
        <TouchableOpacity style={styles.backBtn} onPress={() => router.replace("/")}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>

        {/* 🔹 Profile Header */}
        <Animated.View entering={FadeInUp.delay(200)} style={styles.profileHeader}>
          <TouchableOpacity onPress={openAvatarModal} activeOpacity={0.85}>
            {uploading ? (
              <ActivityIndicator color="#fff" size="large" />
            ) : (
              <Image
                source={getAvatarSource(resolvedAvatarId)}
                style={styles.avatar}
              />
            )}
          </TouchableOpacity>
          <Text style={styles.name}>{userData.fullName || "משתמש חדש"}</Text>
          <Text style={styles.email}>
            {userData.email || auth.currentUser.email}
          </Text>
        </Animated.View>

        {/* 🔹 Cards Area */}
        <View style={styles.contentArea}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>הפרופיל שלך</Text>
            <Text style={styles.sectionSubtitle}>
              התאימי את Booky אלייך בלחיצת כפתור
            </Text>
          </View>

          <View style={styles.statsGrid}>
            {statCards.map((item) => {
              const valueText =
                item.value === undefined || item.value === null || item.value === ""
                  ? "—"
                  : item.value;
              return (
                <View key={item.id} style={styles.statCard}>
                  <Text style={styles.statValue}>{valueText}</Text>
                  <Text style={styles.statLabel}>{item.label}</Text>
                </View>
              );
            })}
          </View>

          <View style={styles.preferenceBox}>
            <Text style={styles.preferenceTitle}>התאמות אישיות</Text>

            <View style={[styles.preferenceRow, styles.preferenceRowFirst]}>
              <View style={styles.preferenceTextWrap}>
                <Text style={styles.preferenceLabel}>התראות דחיפה</Text>
                <Text style={styles.preferenceDesc}>
                  עדכונים על תורים חדשים וביטולים בזמן אמת
                </Text>
              </View>
              <Switch
                style={styles.preferenceSwitch}
                value={preferences.pushNotifications}
                onValueChange={() => togglePreference("pushNotifications")}
                trackColor={{ false: "#d1d5db", true: "#bfc6ff" }}
                thumbColor={preferences.pushNotifications ? "#6C63FF" : "#f4f3f4"}
              />
            </View>

            <View style={styles.preferenceRow}>
              <View style={styles.preferenceTextWrap}>
                <Text style={styles.preferenceLabel}>תזכורות ב-SMS</Text>
                <Text style={styles.preferenceDesc}>
                  קבלי תזכורת אוטומטית שעה לפני התור הבא
                </Text>
              </View>
              <Switch
                style={styles.preferenceSwitch}
                value={preferences.smsReminders}
                onValueChange={() => togglePreference("smsReminders")}
                trackColor={{ false: "#d1d5db", true: "#bfc6ff" }}
                thumbColor={preferences.smsReminders ? "#6C63FF" : "#f4f3f4"}
              />
            </View>

            <View style={styles.preferenceRow}>
              <View style={styles.preferenceTextWrap}>
                <Text style={styles.preferenceLabel}>סנכרון ליומן</Text>
                <Text style={styles.preferenceDesc}>
                  הוספת התור ליומן המועדף עלייך אוטומטית
                </Text>
              </View>
              <Switch
                style={styles.preferenceSwitch}
                value={preferences.calendarSync}
                onValueChange={() => togglePreference("calendarSync")}
                trackColor={{ false: "#d1d5db", true: "#bfc6ff" }}
                thumbColor={preferences.calendarSync ? "#6C63FF" : "#f4f3f4"}
              />
            </View>
          </View>

          {/* Edit personal info */}
          <TouchableOpacity
            style={styles.card}
            onPress={() => {
              setEditing((prev) => !prev);
              setPasswordMode(false);
            }}
          >
            <Image
              source={{ uri: "https://cdn-icons-png.flaticon.com/512/1159/1159633.png" }}
              style={styles.icon}
            />
            <Text style={styles.cardText}>ערוך פרטים אישיים</Text>
          </TouchableOpacity>

          {editing && (
            <View style={styles.editBox}>
              <TextInput
                style={[styles.input, styles.rtl]}
                placeholder="שם מלא"
                placeholderTextColor="#777"
                value={userData.fullName}
                onChangeText={(text) => setUserData({ ...userData, fullName: text })}
                textAlign="right"
              />
              <TextInput
                style={[styles.input, styles.rtl]}
                placeholder="טלפון"
                placeholderTextColor="#777"
                keyboardType="phone-pad"
                value={userData.phone}
                onChangeText={(text) => setUserData({ ...userData, phone: text })}
                textAlign="right"
              />
              <TextInput
                style={[styles.input, styles.rtl]}
                placeholder="אימייל"
                placeholderTextColor="#777"
                keyboardType="email-address"
                value={userData.email}
                onChangeText={(text) => setUserData({ ...userData, email: text })}
                textAlign="right"
              />
              <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
                <Text style={styles.saveText}>שמור</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Change password */}
          <TouchableOpacity
            style={styles.card}
            onPress={() => {
              setPasswordMode((p) => !p);
              setEditing(false);
            }}
          >
            <Image
              source={{ uri: "https://cdn-icons-png.flaticon.com/512/3064/3064197.png" }}
              style={styles.icon}
            />
            <Text style={styles.cardText}>שנה סיסמה</Text>
          </TouchableOpacity>

          {passwordMode && (
            <View style={styles.editBox}>
              <TextInput
                style={[styles.input, styles.rtl]}
                placeholder="הקלד סיסמה חדשה"
                placeholderTextColor="#555"
                secureTextEntry
                value={newPassword}
                onChangeText={setNewPassword}
                textAlign="right"
              />
              <TouchableOpacity style={styles.saveBtn} onPress={handlePasswordChange}>
                <Text style={styles.saveText}>עדכן סיסמה</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* My bookings */}
          <TouchableOpacity style={styles.card} onPress={() => router.push("/MyBookings")}>
            <Image
              source={{ uri: "https://cdn-icons-png.flaticon.com/512/747/747310.png" }}
              style={styles.icon}
            />
            <Text style={styles.cardText}>הצג את התורים שלי</Text>
          </TouchableOpacity>

          {/* Share app */}
          <TouchableOpacity style={styles.card} onPress={handleInviteFriend}>
            <Image
              source={{ uri: "https://cdn-icons-png.flaticon.com/512/929/929426.png" }}
              style={styles.icon}
            />
            <Text style={styles.cardText}>הזמיני חברה להצטרף</Text>
          </TouchableOpacity>

          {/* Support */}
          <TouchableOpacity style={styles.card} onPress={handleSupport}>
            <Image
              source={{ uri: "https://cdn-icons-png.flaticon.com/512/1828/1828940.png" }}
              style={styles.icon}
            />
            <Text style={styles.cardText}>צור קשר עם התמיכה</Text>
          </TouchableOpacity>

          {/* Logout */}
          <TouchableOpacity style={styles.logoutCard} onPress={handleLogout}>
            <Image
              source={{ uri: "https://cdn-icons-png.flaticon.com/512/1828/1828490.png" }}
              style={[styles.icon, { tintColor: "#e74c3c" }]}
            />
            <Text style={[styles.cardText, { color: "#e74c3c" }]}>התנתק</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  notificationWrapper: {
    position: "absolute",
    top: 50,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    zIndex: 20,
  },
  rtl: {
    textAlign: "right",
    writingDirection: "rtl",
  },
  container: { padding: 20, paddingBottom: 100, paddingTop: 20 },
  containerShifted: { paddingTop: 120 },
  backBtn: { marginTop: 50 },
  backArrow: { fontSize: 26, color: "#fff", fontWeight: "bold" },
  profileHeader: { alignItems: "center", marginVertical: 20 },
  avatar: {
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 3,
    borderColor: "#fff",
    backgroundColor: "#fff",
  },
  name: {
    fontSize: 22,
    fontWeight: "900",
    color: "#fff",
    marginTop: 10,
    textAlign: "center",
  },
  email: {
    fontSize: 14,
    color: "#f0f0f0",
    marginTop: 3,
    textAlign: "center",
  },
  contentArea: {
    backgroundColor: "#fff",
    borderRadius: 30,
    paddingVertical: 25,
    paddingHorizontal: 20,
    marginTop: 10,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 6,
  },
  sectionHeader: {
    alignItems: "flex-end",
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#3e3e63",
  },
  sectionSubtitle: {
    fontSize: 13,
    color: "#7a7f9a",
    marginTop: 4,
  },
  statsGrid: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  statCard: {
    width: "48%",
    backgroundColor: "#f7f8ff",
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#e6e9ff",
    alignItems: "flex-end",
    marginBottom: 12,
  },
  statValue: {
    fontSize: 18,
    fontWeight: "800",
    color: "#2d2f55",
    textAlign: "right",
  },
  statLabel: {
    fontSize: 12,
    color: "#6a6f85",
    marginTop: 4,
    textAlign: "right",
  },
  preferenceBox: {
    backgroundColor: "#f9f9ff",
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e6e9ff",
    marginBottom: 18,
  },
  preferenceTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#3e3e63",
    textAlign: "right",
    marginBottom: 8,
  },
  preferenceRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 16,
  },
  preferenceRowFirst: {
    marginTop: 0,
  },
  preferenceTextWrap: {
    flex: 1,
    alignItems: "flex-end",
  },
  preferenceLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: "#3e3e63",
  },
  preferenceDesc: {
    fontSize: 12,
    color: "#7a7f9a",
    marginTop: 4,
    textAlign: "right",
  },
  preferenceSwitch: {
    marginLeft: 16,
  },
  card: {
    flexDirection: "row-reverse",
    alignItems: "center",
    borderRadius: 18,
    padding: 15,
    marginBottom: 12,
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 3,
  },
  icon: { width: 25, height: 25, marginLeft: 12, tintColor: "#6C63FF" },
  cardText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#3e3e63",
    textAlign: "right",
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.3)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#fff",
    paddingTop: 24,
    paddingHorizontal: 20,
    paddingBottom: 28,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  modalHeader: {
    alignItems: "flex-end",
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#3e3e63",
  },
  modalSubtitle: {
    fontSize: 13,
    color: "#6f7392",
    textAlign: "right",
    marginTop: 4,
  },
  avatarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  avatarOption: {
    width: "30%",
    aspectRatio: 1,
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "#e6e9ff",
    marginBottom: 12,
  },
  avatarOptionSelected: {
    borderColor: "#6C63FF",
    borderWidth: 3,
  },
  avatarOptionImage: {
    width: "100%",
    height: "100%",
  },
  modalLoading: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "flex-end",
    marginBottom: 10,
  },
  modalLoadingText: {
    color: "#3e3e63",
    fontSize: 13,
    marginRight: 10,
  },
  modalClose: {
    alignSelf: "center",
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 999,
    backgroundColor: "#6C63FF",
    marginTop: 8,
  },
  modalCloseText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  },
  editBox: {
    backgroundColor: "#f9f9f9",
    borderRadius: 15,
    padding: 15,
    marginBottom: 15,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    padding: 10,
    marginVertical: 5,
    color: "#333",
    fontSize: 15,
  },
  saveBtn: {
    backgroundColor: "#6C63FF",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 8,
  },
  saveText: { color: "#fff", fontWeight: "700" },
  logoutCard: {
    flexDirection: "row-reverse",
    alignItems: "center",
    borderRadius: 18,
    padding: 15,
    marginTop: 12,
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 3,
  },
  loading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f5f7fa",
  },
  loadingText: { marginTop: 10, color: "#3e3e63" },
});
