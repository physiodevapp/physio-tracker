import { CheckboxItem } from "@/interfaces/pose";
import { useEffect, useState } from "react";

interface CheckboxSelectorProps {
  items: CheckboxItem[]; // Array de items a mostrar como checkboxes
  parentStyles?: string; // Estilos para el contenedor principal
  onSelectionChange: (selectedItems: string[]) => void; // Callback para notificar la selección
  buttonLabel?: string; // Texto del botón desplegable
  headerText?: string; // Texto del encabezado
}

export const CheckboxSelector = ({
  items,
  parentStyles = "relative inline-block text-left",
  onSelectionChange,
  buttonLabel = "Select Items",
  headerText = "Metrics",
}: CheckboxSelectorProps) => {
  const [selectedItems, setSelectedItems] = useState<string[]>(() =>
    items.filter((item) => item.defaultChecked === true).map((item) => item.value)
  );
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const handleCheckboxChange = (value: string) => {
    setSelectedItems((prev) =>
      prev.includes(value)
        ? prev.filter((item) => item !== value)
        : [...prev, value]
    );
  };

  // Se actualiza la selección en el componente padre cada vez que cambia el estado
  useEffect(() => {
    onSelectionChange(selectedItems);
  }, [selectedItems, onSelectionChange]);

  return (
    <div className={parentStyles}>
      <p className="text-lg font-medium bg-[#00000045] text-white text-center rounded-md">{headerText}</p>
      <button
        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
        className="inline-flex justify-center w-full px-2 py-[0.5rem] text-[1.2em] font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 mt-[0.3rem]"
      >
        {buttonLabel}
        <svg className="w-5 h-5 ml-2 -mr-1" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06 0L10 10.91l3.71-3.7a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.23 8.27a.75.75 0 010-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {isDropdownOpen && (
        <div
          className={`absolute left-0 z-10 mb-2 w-56 origin-bottom-right bg-white border border-gray-300 rounded-md shadow-lg focus:outline-none bottom-full transition duration-300 ease-in-out transform ${
            isDropdownOpen ? "opacity-100 scale-100" : "opacity-0 scale-95"
          }`}
        >
          <div className="py-1">
            {items.map((item) => (
              <label
                key={item.value}
                className="flex items-center px-4 py-2 text-[1.2em] text-gray-700 cursor-pointer hover:bg-gray-100"
              >
                <input
                  type="checkbox"
                  className="form-checkbox h-5 w-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  value={item.value}
                  checked={selectedItems.includes(item.value)}
                  disabled={item.disabled}
                  onChange={() => handleCheckboxChange(item.value)}
                />
                <span className="ml-2">{item.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
