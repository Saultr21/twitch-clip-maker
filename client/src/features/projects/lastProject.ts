const KEY = "clipforge:lastProject";

/** Nombre del último proyecto activo, para restaurar la sesión al arrancar. */
export function getLastProject(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null; // localStorage puede fallar en modo privado/restringido
  }
}

export function setLastProject(name: string): void {
  try {
    localStorage.setItem(KEY, name);
  } catch {
    // sin persistencia de sesión: no es crítico, el autosave sigue en el server
  }
}

export function clearLastProject(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // no-op
  }
}
