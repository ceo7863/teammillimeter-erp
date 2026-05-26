import { useCallback, useState } from "react";
import { useSaveFeedback } from "@/hooks/useActionNotice";

export function useSaveMessage(initialMessage = "") {
  const [message, setMessageState] = useState(initialMessage);
  const notifySave = useSaveFeedback();

  const setMessage = useCallback(
    (nextMessage: string) => {
      setMessageState(nextMessage);
      if (nextMessage.trim()) notifySave(nextMessage);
    },
    [notifySave]
  );

  const clearMessage = useCallback(() => {
    setMessageState("");
  }, []);

  return { message, setMessage, clearMessage };
}
