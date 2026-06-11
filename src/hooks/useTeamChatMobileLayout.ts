import { useEffect, useState } from "react";

const MOBILE_LAYOUT_QUERY = "(max-width: 1023px)";

export function useTeamChatMobileLayout() {
  const [mobile, setMobile] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(MOBILE_LAYOUT_QUERY).matches : false,
  );

  useEffect(() => {
    const media = window.matchMedia(MOBILE_LAYOUT_QUERY);
    const onChange = () => setMobile(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  return mobile;
}
