"use client";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useDevice } from "@/providers/Device";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => void;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export default function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const deviceSize = useDevice();

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      // console.log("🔥 `beforeinstallprompt` event fired!");
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setShowPrompt(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    // console.log("🛠️ Calling prompt()...");
    deferredPrompt.prompt();
    // const choice = await deferredPrompt.userChoice;
    // console.log("✅ User choice:", choice.outcome);
    setDeferredPrompt(null);
    setShowPrompt(false);
  };

  const handleCancelClick = () => {
    // console.log("❌ User dismissed the PWA prompt.");
    setShowPrompt(false);
  };

  return (
    <AnimatePresence>
      {showPrompt && deviceSize === "mobile" && (
        <motion.div
          className="fixed bottom-4 left-4 right-4 z-50 dark:bg-gray-800 p-4 rounded-lg shadow-xl flex justify-between items-center gap-2 select-none"
          initial={{ y: "100%", opacity: 0 }}
          animate={{ y: "0%", opacity: 1 }}
          exit={{ y: "100%", opacity: 0 }}
          transition={{ duration: 0.3, ease: "easeInOut" }} >
          <p className="dark:text-gray-300 text-md text-center flex-1">Add to home</p>
          <div className="flex gap-3">
            <button
              onClick={handleInstallClick}
              className="bg-[#5dadec] hover:bg-gray-600 text-white font-bold px-4 py-2 rounded-lg transition">
              Yes
            </button>
            <button
              onClick={handleCancelClick}
              className="bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 px-4 py-2 rounded-lg transition">
              No
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
