import { Ionicons } from "@expo/vector-icons";
import { useEffect } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

const TYPE_STYLES = {
  success: {
    backgroundColor: "#e6f9f0",
    borderColor: "#34d399",
    icon: "checkmark-circle",
    iconColor: "#059669",
    textColor: "#064e3b",
  },
  error: {
    backgroundColor: "#fde8e8",
    borderColor: "#f87171",
    icon: "alert-circle",
    iconColor: "#b91c1c",
    textColor: "#7f1d1d",
  },
  info: {
    backgroundColor: "#eef2ff",
    borderColor: "#818cf8",
    icon: "information-circle",
    iconColor: "#4338ca",
    textColor: "#312e81",
  },
};

export default function InlineNotification({
  visible,
  type = "info",
  message,
  onClose,
  autoHideDuration = 4000,
}) {
  useEffect(() => {
    if (!visible || !message) return;
    const timeout = setTimeout(() => {
      onClose?.();
    }, autoHideDuration);
    return () => clearTimeout(timeout);
  }, [visible, message, autoHideDuration, onClose]);

  if (!visible || !message) return null;

  const styles = TYPE_STYLES[type] || TYPE_STYLES.info;

  return (
    <View style={[componentStyles.container, { backgroundColor: styles.backgroundColor, borderColor: styles.borderColor }]}> 
      <Ionicons
        name={styles.icon}
        size={20}
        color={styles.iconColor}
        style={componentStyles.icon}
      />
      <Text style={[componentStyles.message, { color: styles.textColor }]}>{message}</Text>
      <TouchableOpacity onPress={onClose} style={componentStyles.closeBtn}>
        <Ionicons name="close" size={18} color={styles.iconColor} />
      </TouchableOpacity>
    </View>
  );
}

const componentStyles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  icon: {
    marginRight: 10,
  },
  message: {
    flex: 1,
    fontSize: 14,
    textAlign: "right",
  },
  closeBtn: {
    marginLeft: 10,
    padding: 4,
  },
});
