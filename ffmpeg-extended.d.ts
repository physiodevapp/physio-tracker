// ffmpeg-extended.d.ts
import { FFmpeg } from "@ffmpeg/ffmpeg";

declare module "@ffmpeg/ffmpeg" {
  export interface FFmpeg {
    /**
     * Permite leer y escribir archivos en el sistema de archivos virtual.
     * Usa "writeFile" para escribir y "readFile" para leer.
     */
    FS(method: "writeFile" | "readFile", ...args: unknown[]): unknown;

    /**
     * Ejecuta un comando de FFmpeg.
     */
    exec(args: string[]): Promise<void>;

    /**
     * También se puede definir writeFile como un método independiente si se prefiere.
     */
    writeFile?(fileName: string, data: Uint8Array): void;
  }
}
