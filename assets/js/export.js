/**
 * PNG canvas export and JSON preset export.
 */

export function exportPNG(canvas, filename = 'shemwave.png') {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('PNG export failed'));
          return;
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        resolve();
      }, 'image/png');
    } catch (e) {
      reject(e);
    }
  });
}

export function exportPresetJSON(params, filename = 'shemwave-preset.json') {
  const payload = {
    format: 'shemwave-preset',
    version: '1.0',
    exportedAt: new Date().toISOString(),
    params: { ...params },
  };
  const text = JSON.stringify(payload, null, 2);
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  return text;
}

export async function copyPreset(params) {
  const text = JSON.stringify({ format: 'shemwave-preset', params }, null, 2);
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand('copy');
  document.body.removeChild(ta);
  return ok;
}
