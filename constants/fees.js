export const CANCELLATION_FEE_AMOUNT = 50;
export const CANCELLATION_FEE_WINDOW_HOURS = 7;

export const getCancellationFeeReasonLabel = (reason) => {
  switch (reason) {
    case "no_show":
      return "אי הגעה";
    case "late_cancellation":
      return "ביטול מאוחר";
    default:
      return "";
  }
};
