import { forwardRef } from "react";
import { View } from "react-native";

let RecaptchaComponent = forwardRef(function RecaptchaFallback(props, ref) {
  return <View ref={ref} {...props} />;
});

try {
  const { FirebaseRecaptchaVerifierModal } = require("expo-firebase-recaptcha");
  if (FirebaseRecaptchaVerifierModal) {
    RecaptchaComponent = FirebaseRecaptchaVerifierModal;
  }
} catch (_error) {
  console.warn(
    "expo-firebase-recaptcha לא זמינה בסביבה הנוכחית, שימוש במרכיב דמה להגנה על ריצה."
  );
}

export default RecaptchaComponent;
