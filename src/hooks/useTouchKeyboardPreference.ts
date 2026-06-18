import { useState } from "react";

export const useTouchKeyboardPreference = () => {
  // Niet persisteren: na refresh of routewissel start deze voorkeur weer op false.
  const [touchKeyboardPreferred, setTouchKeyboardPreferred] = useState<boolean>(false);

  return {
    touchKeyboardPreferred,
    setTouchKeyboardPreferred,
  };
};
