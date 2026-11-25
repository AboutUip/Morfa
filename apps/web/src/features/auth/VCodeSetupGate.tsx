import { useTranslation } from "react-i18next";

import { VCodeModal } from "../../components/VCodeModal";
import { useAuth } from "./AuthProvider";

export function VCodeSetupGate() {
  const { t } = useTranslation();
  const {
    pendingVCodeSetup,
    completeVCodeSetup,
    cancelVCodeSetup,
  } = useAuth();

  if (!pendingVCodeSetup) return null;

  return (
    <VCodeModal
      mode="set"
      title={t("vcode.setupRequiredTitle")}
      description={t("vcode.setupRequiredBody", {
        account: pendingVCodeSetup.preview.loginAccount,
      })}
      closeLabel={t("vcode.close")}
      onComplete={completeVCodeSetup}
      onClose={cancelVCodeSetup}
    />
  );
}
