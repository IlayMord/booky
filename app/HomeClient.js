import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
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
  const [userAvatar, setUserAvatar] = useState(null);
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
        setUserAvatar(null);
        return;
      }

      const fallbackName = hydrateUserName(user);
      setUserName(fallbackName || "אורח");
      setUserAvatar(user.photoURL || null);

      const loadProfile = async () => {
        try {
          const ref = doc(db, "users", user.uid);
          const snap = await getDoc(ref);
          if (!snap.exists()) return;
          const data = snap.data();
          const profileName = hydrateUserName(user, data);
          if (profileName && isMounted) {
            setUserName(profileName);
          }
          if (isMounted) {
            setUserAvatar(data?.avatar || null);
          }
        } catch (error) {
          console.error("❌ שגיאה בשליפת משתמש:", error);
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

  const quickTips = useMemo(
    () => [
      {
        id: "smartFilters",
        icon: "sparkles-outline",
        label: "סינון חכם",
        description: "מקד את החיפוש שלך לפי קטגוריות",
      },
      {
        id: "instantBooking",
        icon: "flash-outline",
        label: "קביעת בזק",
        description: "קבע תור בלחיצה אחת",
      },
      {
        id: "reviews",
        icon: "chatbubble-ellipses-outline",
        label: "חוות דעת",
        description: "ראה מה לקוחות אחרים חושבים",
      },
    ],
    []
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
          <Image
            source={{
              uri:
                userAvatar || "https://api.dicebear.com/7.x/croodles/png?seed=Sunny",
            }}
            style={styles.avatar}
          />
        </TouchableOpacity>
      </View>

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
              <Image
                source={{
                  uri:
                    b.image ||
                    "https://cdn-icons-png.flaticon.com/512/847/847969.png",
                }}
                style={styles.businessImage}
              />
              <View style={styles.businessContent}>
                <Text style={[styles.businessName, styles.rtl]}>{b.name}</Text>
                <Text style={[styles.businessCategory, styles.rtl]}>
                  {b.category}
                </Text>
                <Text numberOfLines={2} style={[styles.businessDesc, styles.rtl]}>
                  {b.description}
                </Text>
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
