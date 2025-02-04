import React, { useState } from 'react'
import { Dialog, DialogPanel, DialogTitle, Checkbox } from "@headlessui/react"
import { CheckIcon } from '@heroicons/react/24/solid'

interface PoseModalProps {
  isModalOpen: boolean
  handleModal: () => void
}

export const PoseModal: React.FC<PoseModalProps> = ({ isModalOpen, handleModal }) => {
  // Definimos un array con las posiciones (top y left) para cada checkbox
  const checkboxes = [
    { top: "20%", left: "20%" },
    { top: "35%", left: "15%" },
    { top: "50%", left: "30%" },
    { top: "65%", left: "28%" },
    { top: "20%", left: "80%" },
    { top: "35%", left: "85%" },
    { top: "50%", left: "70%" },
    { top: "65%", left: "75%" },
  ]

  // Creamos un estado que es un array de booleanos, uno para cada checkbox
  const [checkboxStates, setCheckboxStates] = useState<boolean[]>(
    new Array(checkboxes.length).fill(false)
  )

  // Función para actualizar el estado de un checkbox específico
  const handleCheckboxChange = (index: number, checked: boolean) => {
    const newStates = [...checkboxStates]
    newStates[index] = checked
    setCheckboxStates(newStates)
  }

  return (
    <Dialog
      open={isModalOpen}
      as="div"
      className="relative z-10 focus:outline-none"
      onClose={handleModal}
    >
      <div className="fixed inset-0 z-10 w-screen overflow-y-auto bg-[#00000066]">
        <div className="flex items-start justify-center p-0">
          <DialogPanel
            transition
            className="w-full max-w-md h-dvh rounded-xl p-6 backdrop-blur-2xl duration-300 ease-out data-[closed]:transform-[scale(95%)] data-[closed]:opacity-0"
            onClick={handleModal}
          >
            <DialogTitle as="h3" className="text-base/7 font-medium text-white">
              Joints to track
            </DialogTitle>
            <div
              className="relative"
              style={{
                height: "70vh",
                backgroundPosition: "center",
                backgroundSize: "contain",
                backgroundRepeat: "no-repeat",
                backgroundImage: "url(/human.png)",
                aspectRatio: "806/2000",
                left: "50%",
                transform: "translate(-50%, 0%)"
              }}
            >
              {checkboxes.map((pos, index) => (
                <Checkbox
                  key={index}
                  checked={checkboxStates[index]}
                  onChange={(checked) => handleCheckboxChange(index, checked)}
                  className="absolute group w-6 h-6 rounded-md bg-white/10 p-1 ring-1 ring-white/15 ring-inset data-[checked]:bg-white"
                  style={{
                    top: pos.top,
                    left: pos.left,
                    transform: "translate(-50%, -50%)"
                  }}
                >
                  <CheckIcon className="hidden w-4 h-4 fill-black group-data-[checked]:block" />
                </Checkbox>
              ))}
            </div>
          </DialogPanel>
        </div>
      </div>
    </Dialog>
  )
}
