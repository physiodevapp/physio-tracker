import React, { useState, useEffect } from "react";
import { CheckIcon } from "@heroicons/react/24/solid";
import { CheckboxItem } from "@/interfaces/CheckboxSelector";

interface PoseModalProps {
  isModalOpen: boolean;
  handleModal: () => void;
  onSelectionChange: (selectedItems: string[]) => void;
  maxSelected?: number;
  jointOptions: CheckboxItem[];
}

export const PoseModal = ({
  isModalOpen,
  handleModal,
  onSelectionChange,
  maxSelected = 6,
  jointOptions,
}: PoseModalProps) => {
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

  // Estado de cada checkbox (por defecto, todos sin marcar)
  const [checkboxStates, setCheckboxStates] = useState<boolean[]>(
    new Array(jointOptions.length).fill(false)
  );

  // Número actual de checkboxes seleccionados
  const selectedCount = checkboxStates.filter(Boolean).length;

  const handleCheckboxChange = (index: number, checked: boolean) => {
    const newStates = [...checkboxStates];
    newStates[index] = checked;
    setCheckboxStates(newStates);
  };

  // Notifica al componente padre la selección actual.
  // Se devuelve un arreglo de strings que contiene el value de cada jointOption seleccionado.
  useEffect(() => {
    const selectedItems = checkboxStates.reduce((acc: string[], state, index) => {
      if (state) {
        acc.push(jointOptions[index].value);
      }
      return acc;
    }, []);
    onSelectionChange(selectedItems);
  }, [checkboxStates, onSelectionChange]);

  if (!isModalOpen) return null;

  return (
    <div
      className="fixed w-full h-dvh inset-0 z-50 flex items-center justify-center"
      style={{ backdropFilter: "blur(30px)" }}
      onClick={handleModal}
    >
      <p
        className="absolute text-white"
        style={{ top: "2rem", fontSize: "1.6em" }}
      >
        Track joints
      </p>
      <div
        className="relative"
        style={{
          height: "70vh",
          backgroundImage: "url('/human.png')",
          backgroundPosition: "center",
          backgroundSize: "contain",
          backgroundRepeat: "no-repeat",
          aspectRatio: "806/2000",
        }}
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
              onChange={(e) =>
                handleCheckboxChange(index, e.target.checked)
              }
              className="absolute opacity-0 w-0 h-0"
            />
            <div
              className={`w-6 h-6 border rounded-md flex items-center justify-center 
                ${checkboxStates[index] ? "bg-white border-white" : "bg-white border-gray-600"}`}
              style={{ opacity: checkboxStates[index] ? "1" : "0.4" }}
            >
              {checkboxStates[index] && <CheckIcon className="w-4 h-4 text-black" />}
            </div>
          </label>
        ))}
      </div>
    </div>
  );
};

export default PoseModal;
