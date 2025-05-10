export function debounce<T extends (...args: Parameters<T>) => void>(func: T, delay: number) {
  let timeout: ReturnType<typeof setTimeout>;

  return (...args: Parameters<T>): void => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => {
      func(...args);
    }, delay);
  };
}
