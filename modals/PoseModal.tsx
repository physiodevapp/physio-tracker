import React, { useState } from "react";
import { CheckIcon } from "@heroicons/react/24/solid";

interface PoseModalProps {
  isModalOpen: boolean;
  handleModal: () => void;
}

export const PoseModal = ({ isModalOpen, handleModal }: PoseModalProps) => {
  const checkboxes = [
    { top: "20%", left: "20%" },
    { top: "35%", left: "15%" },
    { top: "50%", left: "30%" },
    { top: "65%", left: "28%" },
    { top: "20%", left: "80%" },
    { top: "35%", left: "85%" },
    { top: "50%", left: "70%" },
    { top: "65%", left: "75%" },
  ];

  const [checkboxStates, setCheckboxStates] = useState<boolean[]>(
    new Array(checkboxes.length).fill(false)
  );

  const handleCheckboxChange = (index: number, checked: boolean) => {
    const newStates = [...checkboxStates];
    newStates[index] = checked;
    setCheckboxStates(newStates);
  };

  if (!isModalOpen) return null;

  return (
    <div
      className="fixed w-full h-dvh inset-0 z-50 flex items-center justify-center"
      style={{backdropFilter: "blur(30px)"}}
      onClick={handleModal}
    >
      <p className="absolute text-white" style={{top: "2rem", fontSize: "1.6em"}}>Track joints</p>
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
        {checkboxes.map((pos, index) => (
          <label
            key={index}
            className="absolute flex items-center justify-center cursor-pointer"
            style={{
              top: pos.top,
              left: pos.left,
              transform: "translate(-50%, -50%)",
            }}
            onClick={(e) => e.stopPropagation()} // Evita el cierre del modal al hacer clic en los checkboxes
          >
            <input
              type="checkbox"
              checked={checkboxStates[index]}
              onChange={(e) => handleCheckboxChange(index, e.target.checked)}
              className="absolute opacity-0 w-0 h-0"
            />
            <div
              className={`w-6 h-6 border rounded-md flex items-center justify-center 
                            ${
                              checkboxStates[index]
                                ? "bg-white border-white"
                                : "bg-white border-gray-600"
                            } 
                            border`}
              style={{opacity: `${checkboxStates[index] ? "1" : "0.4"}`}}
            >
              {checkboxStates[index] && (
                <CheckIcon className="w-4 h-4 text-black" />
              )}
            </div>
          </label>
        ))}
      </div>
    </div>
  );
};

export default PoseModal;
