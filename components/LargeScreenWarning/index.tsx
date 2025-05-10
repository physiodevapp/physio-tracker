import {
  DevicePhoneMobileIcon,
  ComputerDesktopIcon
} from '@heroicons/react/24/outline';
import Image from 'next/image';

const Index = () => {
  return (
    <div className="flex flex-col items-center justify-center h-dvh text-center px-6 bg-gray-100">
      <div className="flex items-center gap-2 select-none mb-6">
        <Image
          src="/heart-192x192.png"
          alt="App Icon"
          width={32}
          height={32}
          // priority // si quieres que no se haga lazy load
          className="w-8 h-8 animate-pulse" />
        <p className="text-4xl font-bold text-gray-800">PhysiQ</p>
      </div>
      <div className="flex items-center space-x-4 mb-4">
        <ComputerDesktopIcon className="h-12 w-12 text-gray-500" />
        <span className="text-2xl text-gray-400">→</span>
        <DevicePhoneMobileIcon className="h-12 w-12 text-[#5dadec] animate-bounce" />
      </div>
      <h1 className="text-2xl font-semibold text-gray-800 mb-2">
        Oops! Too wide for this app
      </h1>
      <p className="text-gray-600 max-w-sm">
        This app is designed for mobile use only.<br />
        Try resizing your screen or switching to a phone.<br />
        <strong>If you are already using a phone, try disabling auto-rotate.</strong>
      </p>
    </div>
  );
};

export default Index;
