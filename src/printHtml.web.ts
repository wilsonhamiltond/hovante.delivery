// Web twin of printHtml: render the page into a hidden same-origin iframe and print that frame.
// No popup (blockers) and no expo-print (its web build prints the whole current page, app chrome
// included). The iframe is removed once the print dialog has been dismissed.
export async function printHtml(html: string): Promise<void> {
  const frame = document.createElement('iframe');
  frame.style.position = 'fixed';
  frame.style.right = '0';
  frame.style.bottom = '0';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';
  document.body.appendChild(frame);

  await new Promise<void>((resolve) => {
    frame.onload = () => resolve();
    const doc = frame.contentWindow?.document;
    if (!doc) { resolve(); return; }
    doc.open();
    doc.write(html);
    doc.close();
  });

  const win = frame.contentWindow;
  if (win) {
    // afterprint fires when the dialog closes; the fallback timer covers browsers that never
    // deliver it for iframes.
    let done = false;
    const cleanup = () => { if (!done) { done = true; frame.remove(); } };
    win.addEventListener('afterprint', cleanup);
    setTimeout(cleanup, 60000);
    win.focus();
    win.print();
  } else {
    frame.remove();
  }
}
