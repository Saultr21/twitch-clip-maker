import { execa } from "execa";

let gpuChecked = false;
let gpu = false;

/** True si hay una GPU NVIDIA utilizable (nvidia-smi responde). Cacheado. */
export async function hasNvidiaGpu(): Promise<boolean> {
  if (gpuChecked) return gpu;
  gpu = await execa("nvidia-smi", ["-L"], { reject: false })
    .then((r) => r.exitCode === 0 && /GPU \d+:/.test(r.stdout))
    .catch(() => false);
  gpuChecked = true;
  return gpu;
}
