import { useEffect, useState } from "react";

interface JointSelectorProps {
  parentStyles?: string; // Para los estilos del div padre
  onSelectionChange: (selectedJoints: string[]) => void; // Callback para enviar resultados
}

export const JointSelector = ({
  parentStyles = "relative inline-block text-left",
  onSelectionChange,
}: JointSelectorProps) => {
  const [selectedJoints, setSelectedJoints] = useState<string[]>([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const joints = [
    { label: "Right Shoulder", value: "right_shoulder" },
    { label: "Left Shoulder", value: "left_shoulder" },
    { label: "Right Elbow", value: "right_elbow" },
    { label: "Left Elbow", value: "left_elbow" },
    { label: "Right Hip", value: "right_hip" },
    { label: "Left Hip", value: "left_hip" },
    { label: "Right Knee", value: "right_knee" },
    { label: "Left Knee", value: "left_knee" },
  ];

  const handleCheckboxChange = (value: string) => {
    setSelectedJoints((prev) =>
      prev.includes(value)
        ? prev.filter((joint) => joint !== value)
        : [...prev, value]
    );
  };

  // Actualiza el componente padre después del render
  useEffect(() => {
    onSelectionChange(selectedJoints);
  }, [selectedJoints, onSelectionChange]);
  
  return (
    <div className={parentStyles}>
      <p className="text-lg font-medium text-gray-700 p-0 m-0">Metrics</p>
      {/* Botón del desplegable */}
      <button
        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
        className="inline-flex justify-center w-full px-2 py-[0.5rem] text-[1.2em] font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 mt-[0.3rem]"
      >
        Joints
        <svg className="w-5 h-5 ml-2 -mr-1" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06 0L10 10.91l3.71-3.7a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.23 8.27a.75.75 0 010-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {/* Contenido del desplegable */}
      {isDropdownOpen && (
        <div className={`absolute left-0 z-10 mb-2 w-56 origin-bottom-right bg-white border border-gray-300 rounded-md shadow-lg focus:outline-none bottom-full transition duration-300 ease-in-out transform ${
          isDropdownOpen ? "opacity-100 scale-100" : "opacity-0 scale-95"
        }`}>
          <div className="py-1">
            {joints.map((joint) => (
              <label
                key={joint.value}
                className="flex items-center px-4 py-2 text-[1.2em] text-gray-700 cursor-pointer hover:bg-gray-100"
              >
                <input
                  type="checkbox"
                  className="form-checkbox h-5 w-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  value={joint.value}
                  checked={selectedJoints.includes(joint.value)}
                  onChange={() => handleCheckboxChange(joint.value)}
                />
                <span className="ml-2">{joint.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
