// components/Index.tsx
"use client";

import React from "react";
import { ArrowPathIcon } from "@heroicons/react/24/solid";
import { useSettings } from "@/providers/Settings";

const Index: React.FC = () => {
  const {
    settings,
    setRedHueLower1,
    setRedHueUpper1,
    setRedHueLower2,
    setRedHueUpper2,
    setGreenHueLower,
    setGreenHueUpper,
    setBlueHueLower,
    setBlueHueUpper,
    setMinSaturation,
    setMinValue,
    resetColorSettings,
  } = useSettings();

  return (
    <section
      data-element="non-swipeable"
      className="absolute bottom-0 w-full h-[61vh] bg-gradient-to-b from-black/40 to-black rounded-t-lg p-4"
      >
      <div
        className="w-full h-9 flex justify-end text-white/60 italic font-light cursor-pointer"
        onClick={resetColorSettings}
        >
        Set default values{" "}
        <ArrowPathIcon className="ml-2 w-6 h-6" />
      </div>
      {/* Sliders para ajustar parámetros de detección */}
      <div className="mt-2 space-y-2 text-white">
        {/* Parámetros para Rojo */}
        <div className="bg-red-400/60 p-2 rounded-md">
          <div className="flex justify-around gap-6">
            <div className="flex-1">
              <label className="block text-sm">
                Red HL 1: {settings.color.redHueLower1}
              </label>
              <input
                type="range"
                min="0"
                max="180"
                value={settings.color.redHueLower1}
                onChange={(e) =>
                  setRedHueLower1(parseInt(e.target.value, 10))
                }
                className="w-full"
              />
            </div>
            <div className="flex-1">
              <label className="block text-sm">
                Red HU 1: {settings.color.redHueUpper1}
              </label>
              <input
                type="range"
                min="0"
                max="180"
                value={settings.color.redHueUpper1}
                onChange={(e) =>
                  setRedHueUpper1(parseInt(e.target.value, 10))
                }
                className="w-full"
              />
            </div>
          </div>
          <div className="flex justify-around gap-6">
            <div className="flex-1">
              <label className="block text-sm">
                Red HL 2: {settings.color.redHueLower2}
              </label>
              <input
                type="range"
                min="0"
                max="180"
                value={settings.color.redHueLower2}
                onChange={(e) =>
                  setRedHueLower2(parseInt(e.target.value, 10))
                }
                className="w-full"
              />
            </div>
            <div className="flex-1">
              <label className="block text-sm">
                Red HU 2: {settings.color.redHueUpper2}
              </label>
              <input
                type="range"
                min="0"
                max="180"
                value={settings.color.redHueUpper2}
                onChange={(e) =>
                  setRedHueUpper2(parseInt(e.target.value, 10))
                }
                className="w-full"
              />
            </div>
          </div>
        </div>
        {/* Parámetros para Verde */}
        <div className="flex justify-around gap-6 bg-green-400/60 p-2 rounded-md">
          <div className="flex-1">
            <label className="block text-sm">
              Green HL: {settings.color.greenHueLower}
            </label>
            <input
              type="range"
              min="0"
              max="180"
              value={settings.color.greenHueLower}
              onChange={(e) =>
                setGreenHueLower(parseInt(e.target.value, 10))
              }
              className="w-full"
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm">
              Green HU: {settings.color.greenHueUpper}
            </label>
            <input
              type="range"
              min="0"
              max="180"
              value={settings.color.greenHueUpper}
              onChange={(e) =>
                setGreenHueUpper(parseInt(e.target.value, 10))
              }
              className="w-full"
            />
          </div>
        </div>
        {/* Parámetros para Azul */}
        <div className="flex justify-around gap-6 bg-blue-200/60 p-2 rounded-md">
          <div className="flex-1">
            <label className="block text-sm">
              Blue HL: {settings.color.blueHueLower}
            </label>
            <input
              type="range"
              min="0"
              max="180"
              value={settings.color.blueHueLower}
              onChange={(e) =>
                setBlueHueLower(parseInt(e.target.value, 10))
              }
              className="w-full"
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm">
              Blue HU: {settings.color.blueHueUpper}
            </label>
            <input
              type="range"
              min="0"
              max="180"
              value={settings.color.blueHueUpper}
              onChange={(e) =>
                setBlueHueUpper(parseInt(e.target.value, 10))
              }
              className="w-full"
            />
          </div>
        </div>
        {/* Umbrales comunes */}
        <div className="flex justify-around gap-6 p-2">
          <div className="flex-1">
            <label className="block text-sm">
              Min Saturation: {settings.color.minSaturation}
            </label>
            <input
              type="range"
              min="0"
              max="255"
              value={settings.color.minSaturation}
              onChange={(e) =>
                setMinSaturation(parseInt(e.target.value, 10))
              }
              className="w-full"
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm">
              Min Value: {settings.color.minValue}
            </label>
            <input
              type="range"
              min="0"
              max="255"
              value={settings.color.minValue}
              onChange={(e) =>
                setMinValue(parseInt(e.target.value, 10))
              }
              className="w-full"
            />
          </div>
        </div>
      </div>
    </section>
  );
};

export default Index;
