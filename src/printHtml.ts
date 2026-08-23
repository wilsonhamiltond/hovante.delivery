import * as Print from 'expo-print';

// Hand an HTML page to the OS print flow (AirPrint / Android print services). The web twin
// (printHtml.web.ts) prints through a hidden iframe instead -- same split as the map WebViews.
export async function printHtml(html: string): Promise<void> {
  await Print.printAsync({ html });
}
