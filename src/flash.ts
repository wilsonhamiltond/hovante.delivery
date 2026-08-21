// A one-shot message handed from one screen to the previous one -- "Guardado." set by the product
// form as it navigates back, shown by the list when it regains focus. router.back() carries no
// params, so the note travels here instead. Read-once: taking it clears it, so the notice does not
// reappear on every later visit to the list.
let pending: string | null = null;

export function setFlash(message: string) {
  pending = message;
}

export function takeFlash(): string | null {
  const message = pending;
  pending = null;
  return message;
}
