import { useState } from "react";

interface SelectorProps {
  title: string
  value: number;
  onChange: (value: number) => void;
  parentStyles?: string;
}

export const DropdwonSelector = ({ title = "", value, onChange, parentStyles = "relative inline-block text-left" }: SelectorProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const options = Array.from({ length: 11 }, (_, i) => i + 5);

  return (
    <div className={parentStyles}>
      <p className="bg-[#00000045] text-white text-center rounded-md text-lg font-medium px-1">{title}</p>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="mt-[0.2rem] flex w-20 p-2 text-[1.2rem] font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 hover:bg-gray-50"
      >
        {value}
        <svg className="w-5 h-5 ml-2 -mr-1" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06 0L10 10.91l3.71-3.7a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.23 8.27a.75.75 0 010-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute bottom-full mb-2 w-20 origin-bottom-left bg-white border border-gray-300 rounded-md shadow-lg">
          <ul className="py-1">
            {options.map((option) => (
              <li
                key={option}
                className="px-4 py-2 text-[1.2rem] text-gray-700 cursor-pointer hover:bg-gray-100"
                onClick={() => {
                  onChange(option);
                  setIsOpen(false); // Cerrar menú al seleccionar
                }}
              >
                {option}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
