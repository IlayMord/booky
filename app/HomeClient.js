import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { collection, getDocs } from "firebase/firestore";
import { useEffect, useState } from "react";
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

export default function HomeClient() {
  const [businesses, setBusinesses] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState("הכול");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState("");
  const router = useRouter();

  // ✅ שליפת עסקים מ-Firestore
  useEffect(() => {
    const fetchBusinesses = async () => {
      try {
        const querySnap = await getDocs(collection(db, "businesses"));
        const data = querySnap.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setBusinesses(data);
        setFiltered(data);
        const cats = ["הכול", ...new Set(data.map((b) => b.category))];
        setCategories(cats);
      } catch (error) {
        console.error("❌ שגיאה בשליפת עסקים:", error);
      } finally {
        setLoading(false);
      }
    };

    // שם המשתמש
    const user = auth.currentUser;
    if (user) {
      setUserName(user.displayName?.split(" ")[0] || "משתמש");
    }

    fetchBusinesses();
  }, []);

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
        <TouchableOpacity onPress={() => router.push("/Profile")}>
          <Image
            source={{
              uri: "https://cdn-icons-png.flaticon.com/512/149/149071.png",
            }}
            style={styles.avatar}
          />
        </TouchableOpacity>

        <View style={{ flex: 1, alignItems: "flex-end" }}>
          <Text style={styles.greeting}>ברוך הבא, {userName} 👋</Text>
          <Text style={styles.subGreeting}>גלה עסקים סביבך</Text>
        </View>
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
                { elevation: selected ? 4 : 0 },
              ]}
            >
              <Text
                style={[
                  styles.categoryText,
                  selected && styles.categoryTextSelected,
                ]}
              >
                {cat}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

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
    backgroundColor: "#f5f7fa",
    paddingHorizontal: 20,
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
    marginBottom: 15,
    flexDirection: "row-reverse",
    alignItems: "center",
  },
  avatar: {
    width: 45,
    height: 45,
    borderRadius: 25,
    backgroundColor: "#ddd",
    marginLeft: 10,
  },
  greeting: {
    fontSize: 22,
    fontWeight: "700",
    color: "#333",
  },
  subGreeting: {
    fontSize: 14,
    color: "#777",
  },
  /* SEARCH */
  searchRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 15,
    paddingHorizontal: 15,
    paddingVertical: 10,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    marginBottom: 15,
  },
  searchInput: {
    flex: 1,
    marginRight: 10,
    fontSize: 16,
    color: "#333",
  },
  /* CATEGORIES */
  categoriesContainer: {
    flexDirection: "row-reverse",
    paddingVertical: 10,
  },
  categoryBtn: {
    backgroundColor: "#eee",
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginLeft: 8,
  },
  categorySelected: {
    backgroundColor: "#6C63FF",
  },
  categoryText: {
    color: "#3e3e63",
    fontWeight: "600",
    fontSize: 14,
  },
  categoryTextSelected: {
    color: "#fff",
  },
  /* BUSINESS CARD */
  businessCard: {
    backgroundColor: "#fff",
    borderRadius: 20,
    marginBottom: 15,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    overflow: "hidden",
  },
  businessImage: {
    width: "100%",
    height: screenWidth * 0.45,
  },
  businessContent: {
    padding: 12,
  },
  businessName: {
    fontSize: 18,
    fontWeight: "800",
    color: "#333",
  },
  businessCategory: {
    color: "#6C63FF",
    fontWeight: "600",
    marginBottom: 5,
  },
  businessDesc: {
    color: "#777",
    fontSize: 14,
    lineHeight: 20,
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
