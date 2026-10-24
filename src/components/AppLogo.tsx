import React, { useState } from "react";
import { Scan } from "lucide-react";
import originalLogoImg from "../assets/images/abookscan_app_logo_1786906598385.jpg";

interface AppLogoProps {
  className?: string;
  size?: "sm" | "md" | "lg" | "hero";
}

export const AppLogo: React.FC<AppLogoProps> = ({
  className = "",
  size = "md",
}) => {
  const [useFallback, setUseFallback] = useState(false);

  const sizeClasses = {
    sm: "w-5 h-5 rounded-md",
    md: "w-8 h-8 rounded-xl",
    lg: "w-12 h-12 rounded-2xl",
    hero: "w-20 h-20 sm:w-24 sm:h-24 rounded-2xl",
  };

  const iconSizes = {
    sm: "w-3 h-3",
    md: "w-4 h-4",
    lg: "w-6 h-6",
    hero: "w-10 h-10",
  };

  return (
    <div className={`relative inline-block shrink-0 ${className}`}>
      <img
        src={useFallback ? originalLogoImg : "/icon.png?v=4.0"}
        alt="AbookScan IA Logo"
        onError={() => {
          if (!useFallback) {
            setUseFallback(true);
          }
        }}
        className={`${sizeClasses[size]} object-cover shadow-2xl border border-teal-500/40 p-0.5 bg-zinc-950`}
        referrerPolicy="no-referrer"
      />
    </div>
  );
};

export default AppLogo;
