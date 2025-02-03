import React, { useState, useEffect } from "react";

interface ToggleHeightComponentProps {
  onVisibilityChange: (isHalfHeight: boolean) => void;
  parentStyles?: string;
}

export const DisplayGraphsButton = ({
  onVisibilityChange,
  parentStyles = "relative inline-block text-left",
}: ToggleHeightComponentProps) => {
  // Estado booleano: true para h-[50vh], false para h-screen
  const [isHalfHeight, setIsHalfHeight] = useState(false);

  // Función para alternar la altura
  const toggleHeight = () => {
    setIsHalfHeight((prev) => !prev);
  };

  // useEffect que notifica al componente padre cada vez que cambia isHalfHeight
  useEffect(() => {
    onVisibilityChange(isHalfHeight);
  }, [isHalfHeight, onVisibilityChange]);

  return (
    <button
        onClick={toggleHeight}
        className={parentStyles}
      >
        {/* Ícono proporcionado */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          className="w-6 h-6"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M10.5 6a7.5 7.5 0 1 0 7.5 7.5h-7.5V6Z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M13.5 10.5H21A7.5 7.5 0 0 0 13.5 3v7.5Z"
          />
        </svg>
      </button>
  );
};