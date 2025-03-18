"use client";

import React, { useState, useEffect } from "react";
import { checkbox } from "@/interfaces/checkbox";
import { CanvasKeypointName } from "@/interfaces/pose";
import { StopIcon } from "@heroicons/react/24/solid";

interface IndexProps {
  isModalOpen: boolean;
  handleModal: () => void;
  onSelectionChange: (selectedItems: string[]) => void;
  maxSelected?: number;
  jointOptions: checkbox[];
  initialSelectedJoints?: CanvasKeypointName[];
}

const Index = ({
  isModalOpen,
  handleModal,
  onSelectionChange,
  maxSelected = 6,
  jointOptions,
  initialSelectedJoints = [],
}: IndexProps) => {
  // Estado de cada checkbox (por defecto, todos sin marcar)
  const [checkboxStates, setCheckboxStates] = useState<boolean[]>(
    jointOptions.map((joint) => initialSelectedJoints.includes(joint.value as CanvasKeypointName))
  );

  // Número actual de checkboxes seleccionados
  const selectedCount = checkboxStates.filter(Boolean).length;

  const handleCheckboxChange = (index: number, checked: boolean) => {
    const newStates = [...checkboxStates];

    newStates[index] = checked;

    setCheckboxStates(newStates);
  };

  // Posiciones de cada checkbox sobre la imagen.
  // Se asume que el número de posiciones es igual al de jointOptions.
  const positions = [
    { top: "20%", left: "20%" },
    { top: "35%", left: "15%" },
    { top: "50%", left: "30%" },
    { top: "65%", left: "28%" },
    { top: "20%", left: "80%" },
    { top: "35%", left: "85%" },
    { top: "50%", left: "70%" },
    { top: "65%", left: "75%" },
  ];

  // Notifica al componente padre la selección actual.
  // Se devuelve un arreglo de strings que contiene el value de cada jointOption seleccionado.
  useEffect(() => {
    const selectedItems = checkboxStates.reduce(
      (acc: string[], state, index) => {
        if (state) {
          acc.push(jointOptions[index].value);
        }
        return acc;
      },
      []
    );
    onSelectionChange(selectedItems);
  }, [checkboxStates, onSelectionChange]);

  if (!isModalOpen) return null;

  return (
    <div
      data-element="non-swipeable"
      className="fixed w-full h-dvh inset-0 z-50 flex items-center justify-center"
      style={{ backdropFilter: "blur(30px)" }}
      onClick={handleModal}
      >
      <p className="absolute top-4 text-white text-lg bg-black/40 px-4 py-2 rounded-md">
        Track joints
      </p>
      <div
        className="relative h-[70vh] bg-[url('/human.png')] bg-center bg-contain bg-no-repeat aspect-[806/2000]"
        onClick={(e) => {
          e.stopPropagation();

          handleModal();
        }}
        >
        {jointOptions.map((joint, index) => (
          <label
            key={joint.value}
            className="absolute flex items-center justify-center cursor-pointer"
            style={{
              // Utilizamos la posición correspondiente según el índice
              top: positions[index].top,
              left: positions[index].left,
              transform: "translate(-50%, -50%)",
            }}
            onClick={(e) => e.stopPropagation()} // Evita el cierre del modal al hacer clic en un checkbox
            >
            <input
              type="checkbox"
              checked={checkboxStates[index]}
              disabled={!checkboxStates[index] && selectedCount >= maxSelected}
              onChange={(e) => handleCheckboxChange(index, e.target.checked)}
              className="absolute opacity-0 w-0 h-0"
              />
            <div
              className={`w-6 h-6 border rounded-[0.4rem] flex items-center justify-center 
                ${
                  checkboxStates[index]
                    ? "bg-white border-white"
                    : "bg-white border-gray-600"
                }
                ${
                  checkboxStates[index] 
                  ? "opacity-100"
                  : "opacity-40"
                }`}
                >
              {checkboxStates[index] && (
                <StopIcon className="w-6 h-6 text-blue-500"/>
              )}
            </div>
          </label>
        ))}
      </div>
    </div>
  );
};

export default Index;
