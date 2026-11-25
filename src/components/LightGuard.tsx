/* src/components/LightGuard.tsx */
import React, { useEffect } from "react";

const LIGHT = { bg: "#eef2f0", card: "#ffffff", ink: "#12261c", mute: "#6f8077", line: "#e6ece8", green: "#12935a" };

export const LightGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
    };
    mq.addListener(handleChange);
    return () => mq.removeListener(handleChange);
  }, []);
  return <>{children}</>;
};