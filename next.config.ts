import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  output: 'export',
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Ignorar el módulo '@mediapipe/pose' en el cliente
      config.resolve.alias['@mediapipe/pose'] = false;
      // Para el lado del cliente, establecer un fallback para "fs"
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
      };
    }
    return config;
  },
};

export default nextConfig;
