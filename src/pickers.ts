// Make every date/time chip open the phone's picker reliably.
// The chips hide a real <input type="date|time"> on top of themselves; some phones
// ignore taps on an invisible input, so a tap anywhere on the chip also asks the
// browser to open the picker directly.
export function installPickerHelper() {
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement | null;
    const holder = target?.closest('.chip-input, .date-input, .due-pick');
    if (!holder) return;
    const input = holder.querySelector<HTMLInputElement>('input[type="date"], input[type="time"]');
    if (!input || input.disabled) return;
    try {
      input.focus({ preventScroll: true });
      input.showPicker?.();
    } catch {
      /* already open, or not supported: the native tap still works */
    }
  });
}
