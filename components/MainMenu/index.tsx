import { MainMenuOption } from "@/interfaces/menu";
import {
  DevicePhoneMobileIcon,
  PaintBrushIcon,
  ScaleIcon,
  UserIcon,
  HomeIcon,
} from "@heroicons/react/24/solid";
import { motion } from "framer-motion";
import React from "react";

interface IndexProps {
  isMainMenuOpen: boolean;
  currentPage: MainMenuOption;
  navigateTo: (path: MainMenuOption) => void;
}

const Index: React.FC<IndexProps> = ({ isMainMenuOpen, navigateTo, currentPage }) => {
  const handleClick = (page: MainMenuOption) => {
    navigateTo(page);
  };

  return (
    <motion.div
      initial={{ y: "-100%", opacity: 0 }}
      animate={{ y: isMainMenuOpen ? "0%" : "-100%", opacity: isMainMenuOpen ? 1 : 0 }}
      exit={{ y: "-100%", opacity: 0 }}
      transition={{ type: "spring", stiffness: 100, damping: 15 }}
      className="fixed top-0 z-40 inset-x-0 mx-auto w-[60vw] h-12 rounded-b-3xl bg-[#5dadec] dark:bg-gray-800 text-white flex items-center justify-center gap-4 shadow-lg px-2">
      <UserIcon
        className={`w-6 h-6 text-white ${
          currentPage === "pose" ? "opacity-100" : "opacity-40"
        }`}
        onClick={() => handleClick("pose")}
      />
      <DevicePhoneMobileIcon
        className={`w-6 h-6 text-white mr-6 ${
          currentPage === "force" ? "opacity-100" : "opacity-40"
        }`}
        onClick={() => handleClick("force")}
      />
      <div 
        className="absolute p-4 rounded-full bg-[#5dadec] dark:bg-gray-800"
        onClick={() => handleClick("home")}>
        <HomeIcon className="w-[2.2rem] h-[2.2rem] text-white opacity-40 hover:opacity-100"/>
      </div>
      <PaintBrushIcon
        className={`w-6 h-6 text-white ml-6 ${
          currentPage === "bodychart" ? "opacity-100" : "opacity-40"
        }`}
        onClick={() => handleClick("bodychart")}
      />
      <ScaleIcon
        className={`w-6 h-6 text-white ${
          currentPage === "balance" ? "opacity-100" : "opacity-40"
        }`}
        onClick={() => handleClick("balance")}
      />
    </motion.div>
  );
};

export default Index;
