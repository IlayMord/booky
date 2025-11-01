import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Dimensions,
    Image,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { auth, db } from "../firebaseConfig";
import {
  defaultAvatarId,
  getAvatarSource,
  isValidAvatarId,
} from "../constants/profileAvatars";
import { syncAppointmentNotifications } from "../utils/pushNotifications";

const screenWidth = Dimensions.get("window").width;

const hydrateUserName = (user, profileData) => {
  if (profileData) {
    const raw =
      profileData.fullName ||
      profileData.displayName ||
      profileData.name ||
      profileData.firstName;
    if (raw) {
      return raw.trim().split(" ")[0];
    }
  }
  if (user?.displayName) {
    return user.displayName.trim().split(" ")[0];
  }
  if (user?.email) {
    return user.email.split("@")[0];
  }
  return "";
};

export default function HomeClient() {
  const [businesses, setBusinesses] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState("הכול");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState(null);
  const [userAvatarId, setUserAvatar] = useState(defaultAvatarId);
  const [securityStatus, setSecurityStatus] = useState({
    emailVerified: true,
    phoneVerified: true,
  });
  const router = useRouter();

  // ✅ שליפת עסקים והאזנה למצב המשתמש
  useEffect(() => {
    let isMounted = true;

    const fetchBusinesses = async () => {
      try {
        const querySnap = await getDocs(collection(db, "businesses"));
        if (!isMounted) return;
        const data = querySnap.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }));
        setBusinesses(data);
        setFiltered(data);
        const cats = ["הכול", ...new Set(data.map((b) => b.category))];
        setCategories(cats);
      } catch (error) {
        console.error("❌ שגיאה בשליפת עסקים:", error);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!isMounted) return;
      if (!user) {
        setUserName("אורח");
        setUserAvatar(defaultAvatarId);
        setSecurityStatus({ emailVerified: true, phoneVerified: true });
        return;
      }

      const fallbackName = hydrateUserName(user);
      setUserName(fallbackName || "אורח");

      const loadProfile = async () => {
        try {
          const ref = doc(db, "users", user.uid);
          const snap = await getDoc(ref);
          let pushEnabled = true;
          if (!snap.exists()) {
            if (isMounted) {
              setUserAvatar(defaultAvatarId);
              setSecurityStatus({
                emailVerified: Boolean(user.emailVerified),
                phoneVerified: Boolean(user.phoneNumber),
              });
            }
          } else {
            const data = snap.data();
            const profileName = hydrateUserName(user, data);
            if (profileName && isMounted) {
              setUserName(profileName);
            }
            if (isMounted) {
              const avatarId = isValidAvatarId(data?.avatar)
                ? data.avatar
                : defaultAvatarId;
              setUserAvatar(avatarId);
              setSecurityStatus({
                emailVerified: Boolean(user.emailVerified),
                phoneVerified: Boolean(data?.phoneVerified || user.phoneNumber),
              });
            }
            if (typeof data?.preferences?.pushNotifications === "boolean") {
              pushEnabled = data.preferences.pushNotifications;
            }
          }

          try {
            if (pushEnabled) {
              const appointmentsSnapshot = await getDocs(
                query(
                  collection(db, "appointments"),
                  where("userId", "==", user.uid)
                )
              );
              const appointments = appointmentsSnapshot.docs.map((docSnap) => ({
                id: docSnap.id,
                ...docSnap.data(),
              }));
              await syncAppointmentNotifications(appointments, { enabled: true });
            } else {
              await syncAppointmentNotifications([], { enabled: false });
            }
          } catch (notificationsError) {
            console.error(
              "❌ שגיאה בסנכרון התראות לתורים:",
              notificationsError
            );
          }
        } catch (error) {
          console.error("❌ שגיאה בשליפת משתמש:", error);
          if (isMounted) {
            setUserAvatar(defaultAvatarId);
            setSecurityStatus({
              emailVerified: Boolean(user.emailVerified),
              phoneVerified: Boolean(user.phoneNumber),
            });
          }
        }
      };

      loadProfile();
    });

    hydrateUserName();
    fetchBusinesses();

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  const heroName = userName ?? "";
  const heroAvatarSource = getAvatarSource(userAvatarId);

  const topExperiences = useMemo(
    () =>
      businesses
        .filter(
          (business) =>
            Array.isArray(business.galleryImages) && business.galleryImages.length > 0
        )
        .slice(0, 5),
    [businesses]
  );

  // ✅ סינון עסקים לפי קטגוריה וחיפוש
  useEffect(() => {
    let results = businesses;
    if (selectedCategory !== "הכול") {
      results = results.filter((b) => b.category === selectedCategory);
    }
    if (search.trim() !== "") {
      results = results.filter(
        (b) =>
          b.name.toLowerCase().includes(search.toLowerCase()) ||
          b.description.toLowerCase().includes(search.toLowerCase())
      );
    }
    setFiltered(results);
  }, [businesses, search, selectedCategory]);

  if (loading)
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color="#6C63FF" />
        <Text style={{ marginTop: 10 }}>טוען עסקים...</Text>
      </SafeAreaView>
    );

  return (
    <SafeAreaView style={styles.container}>
      {/* ===== Header ===== */}
      <View style={styles.header}>
        <View style={styles.headerTextWrap}>
          <Text style={styles.greeting}>
            {heroName ? `ברוך הבא, ${heroName} 👋` : "ברוך הבא 👋"}
          </Text>
          <Text style={styles.subGreeting}>מצא את השירות המושלם עבורך</Text>
        </View>
        <TouchableOpacity onPress={() => router.push("/Profile")}>
          <Image source={heroAvatarSource} style={styles.avatar} />
        </TouchableOpacity>
      </View>

      <View style={styles.heroCard}>
        <View style={styles.heroTextWrap}>
          <Text style={styles.heroHeadline}>תור אחד קדימה</Text>
          <Text style={styles.heroSubHeadline}>
            הזמנות חכמות, תזכורות אוטומטיות וחוויית פרימיום שדואגת לכל הפרטים.
          </Text>
        </View>
        <TouchableOpacity
          style={styles.heroButton}
          onPress={() => router.push("/MyBookings")}
          activeOpacity={0.9}
        >
          <Ionicons name="calendar-outline" size={18} color="#fff" />
          <Text style={styles.heroButtonText}>התורים שלי</Text>
        </TouchableOpacity>
      </View>

      {(!securityStatus.emailVerified || !securityStatus.phoneVerified) && (
        <View style={styles.securityBanner}>
          <View style={styles.securityBannerText}>
            <Text style={styles.securityBannerTitle}>נשדרג את האבטחה?</Text>
            <Text style={styles.securityBannerSubtitle}>
              אימות קצר של המייל והטלפון מבטיח שלא תחמיץי שום עדכון חשוב
            </Text>
          </View>
          <TouchableOpacity
            style={styles.securityBannerButton}
            onPress={() => router.push("/Profile")}
          >
            <Text style={styles.securityBannerButtonText}>לאימות</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ===== Search ===== */}
      <View style={styles.searchRow}>
        <Ionicons name="search-outline" size={22} color="#6C63FF" />
        <TextInput
          placeholder="חפש עסק, שירות או קטגוריה..."
          placeholderTextColor="#aaa"
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          textAlign="right"
        />
      </View>

      {/* ===== Categories ===== */}
      <View style={styles.categoriesWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoriesContainer}
        >
          {categories.map((cat, i) => {
            const selected = cat === selectedCategory;
            return (
              <TouchableOpacity
                key={i}
                onPress={() => setSelectedCategory(cat)}
                style={[
                  styles.categoryBtn,
                  selected && styles.categorySelected,
                ]}
                activeOpacity={0.85}
              >
                <Ionicons
                  name={selected ? "checkmark-circle" : "ellipse-outline"}
                  size={16}
                  color={selected ? "#fff" : "#9aa3c4"}
                  style={styles.categoryIcon}
                />
                <Text
                  style={[
                    styles.categoryText,
                    selected && styles.categoryTextSelected,
                  ]}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {cat}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* ===== Business Cards ===== */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 }}
      >
        {topExperiences.length > 0 && (
          <View style={styles.experienceSection}>
            <Text style={styles.sectionHeading}>טעימה מהחוויה</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.experienceScroll}
            >
              {topExperiences.map((business) => {
                const heroImage =
                  (business.galleryImages?.[0]?.uri ?? business.galleryImages?.[0]) ||
                  business.image;
                return (
                  <TouchableOpacity
                    key={business.id}
                    style={styles.experienceCard}
                    activeOpacity={0.9}
                    onPress={() => router.push(`/Business/${business.id}`)}
                  >
                    {heroImage ? (
                      <Image source={{ uri: heroImage }} style={styles.experienceImage} />
                    ) : (
                      <View style={styles.experiencePlaceholder}>
                        <Ionicons name="image-outline" size={32} color="#9ca3c8" />
                      </View>
                    )}
                    <View style={styles.experienceOverlay}>
                      <Text style={styles.experienceName}>{business.name}</Text>
                      <Text style={styles.experienceCategory}>{business.category}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}
        {filtered.length === 0 ? (
          <View style={styles.noResults}>
            <Ionicons name="alert-circle-outline" size={40} color="#aaa" />
            <Text style={styles.noResultsText}>לא נמצאו תוצאות</Text>
          </View>
        ) : (
          filtered.map((b) => (
            <TouchableOpacity
              key={b.id}
              style={styles.businessCard}
              activeOpacity={0.9}
              onPress={() => router.push(`/Business/${b.id}`)} // 👈 זה המעבר הנכון
            >
              {(() => {
                const galleryCover =
                  (b.galleryImages?.[0]?.uri ?? b.galleryImages?.[0]) || b.image;
                const imageUri =
                  galleryCover || "https://cdn-icons-png.flaticon.com/512/847/847969.png";
                return (
                  <Image source={{ uri: imageUri }} style={styles.businessImage} />
                );
              })()}
              <View style={styles.businessContent}>
                <Text style={[styles.businessName, styles.rtl]}>{b.name}</Text>
                <Text style={[styles.businessCategory, styles.rtl]}>
                  {b.category}
                </Text>
                <Text numberOfLines={2} style={[styles.businessDesc, styles.rtl]}>
                  {b.description}
                </Text>
                {Array.isArray(b.galleryImages) && b.galleryImages.length > 0 && (
                  <Text style={styles.businessGalleryHint}>כולל גלריית חוויה</Text>
                )}
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  rtl: { textAlign: "right", writingDirection: "rtl" },
  container: {
    flex: 1,
    backgroundColor: "#f3f5ff",
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f5f7fa",
  },
  /* HEADER */
  header: {
    marginTop: 5,
    marginBottom: 18,
    flexDirection: "row-reverse",
    alignItems: "center",
  },
  headerTextWrap: {
    flex: 1,
    alignItems: "flex-end",
    paddingRight: 6,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#e7e9ff",
    marginLeft: 12,
    borderWidth: 1,
    borderColor: "#d8dcff",
  },
  greeting: {
    fontSize: 23,
    fontWeight: "700",
    color: "#1f2937",
  },
  subGreeting: {
    fontSize: 14,
    color: "#5b6473",
    marginTop: 4,
  },
  heroCard: {
    marginBottom: 16,
    backgroundColor: "#1f1b5c",
    borderRadius: 24,
    paddingVertical: 18,
    paddingHorizontal: 18,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
  },
  heroTextWrap: {
    flex: 1,
    alignItems: "flex-end",
    paddingLeft: 12,
  },
  heroHeadline: {
    fontSize: 20,
    fontWeight: "800",
    color: "#fff",
  },
  heroSubHeadline: {
    marginTop: 6,
    color: "rgba(255,255,255,0.75)",
    fontSize: 13,
    textAlign: "right",
    lineHeight: 18,
  },
  heroButton: {
    backgroundColor: "#6C63FF",
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    elevation: 2,
  },
  heroButtonText: {
    color: "#fff",
    fontWeight: "700",
  },
  securityBanner: {
    flexDirection: "row-reverse",
    alignItems: "center",
    backgroundColor: "#f8f1ff",
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e2d9ff",
    marginBottom: 18,
  },
  securityBannerText: {
    flex: 1,
    alignItems: "flex-end",
    gap: 4,
  },
  securityBannerTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#3b2b7a",
  },
  securityBannerSubtitle: {
    fontSize: 12,
    color: "#6b5a9c",
    textAlign: "right",
  },
  securityBannerButton: {
    marginLeft: 12,
    backgroundColor: "#6C63FF",
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  securityBannerButtonText: {
    color: "#fff",
    fontWeight: "700",
  },
  /* SEARCH */
  searchRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 12,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: "#e3e7ff",
  },
  searchInput: {
    flex: 1,
    marginRight: 12,
    fontSize: 16,
    color: "#1f2937",
  },
  /* CATEGORIES */
  categoriesWrapper: {
    backgroundColor: "#fff",
    borderRadius: 28,
    paddingVertical: 6,
    paddingRight: 10,
    borderWidth: 1,
    borderColor: "#e0e6ff",
    shadowColor: "#1f2359",
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
    marginBottom: 22,
  },
  categoriesContainer: {
    flexDirection: "row-reverse",
    paddingVertical: 16,
    alignItems: "center",
    paddingLeft: 12,
  },
  categoryBtn: {
    backgroundColor: "#fff",
    borderRadius: 24,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginHorizontal: 6,
    borderWidth: 1,
    borderColor: "#e0e3ef",
    width: 120,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
    flexDirection: "row-reverse",
  },
  categorySelected: {
    backgroundColor: "#6C63FF",
    borderColor: "#6C63FF",
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 5,
  },
  categoryIcon: {
    marginLeft: 8,
  },
  categoryText: {
    color: "#3e3e63",
    fontWeight: "700",
    fontSize: 15,
    textAlign: "center",
  },
  categoryTextSelected: {
    color: "#fff",
  },
  experienceSection: {
    marginBottom: 18,
  },
  sectionHeading: {
    fontSize: 16,
    fontWeight: "800",
    color: "#1f2937",
    textAlign: "right",
    marginBottom: 12,
  },
  experienceScroll: {
    flexDirection: "row",
    gap: 12,
  },
  experienceCard: {
    width: 200,
    height: 140,
    borderRadius: 18,
    overflow: "hidden",
    marginLeft: 12,
    backgroundColor: "#f2f3fb",
  },
  experienceImage: {
    width: "100%",
    height: "100%",
  },
  experiencePlaceholder: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  experienceOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "rgba(31,27,92,0.75)",
  },
  experienceName: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 14,
    textAlign: "right",
  },
  experienceCategory: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 12,
    textAlign: "right",
    marginTop: 2,
  },
  /* BUSINESS CARD */
  businessCard: {
    backgroundColor: "#fff",
    borderRadius: 24,
    marginBottom: 18,
    shadowColor: "#1f2359",
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 4,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#e6e9ff",
  },
  businessImage: {
    width: "100%",
    height: screenWidth * 0.42,
  },
  businessContent: {
    paddingHorizontal: 18,
    paddingVertical: 16,
    alignItems: "flex-end",
  },
  businessName: {
    fontSize: 19,
    fontWeight: "800",
    color: "#111827",
  },
  businessCategory: {
    color: "#6C63FF",
    fontWeight: "600",
    marginBottom: 4,
  },
  businessDesc: {
    color: "#5b6473",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 2,
  },
  businessGalleryHint: {
    marginTop: 10,
    fontSize: 12,
    color: "#6C63FF",
    fontWeight: "700",
    textAlign: "right",
  },
  /* EMPTY */
  noResults: {
    justifyContent: "center",
    alignItems: "center",
    marginTop: 40,
  },
  noResultsText: {
    color: "#888",
    fontSize: 16,
    marginTop: 10,
  },
});
