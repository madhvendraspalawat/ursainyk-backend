import net from 'node:net';

/**
 * Minimal clamd INSTREAM client (no dependency): stream the file to the
 * ClamAV daemon, get OK / FOUND back. Enabled when CLAMD_HOST is set —
 * docker compose ships an optional `clamav` service (profile "av").
 * Fail-closed: if the daemon is configured but unreachable, the scan throws
 * and the job retries — an unscanned file never proceeds.
 */
export interface ScanResult {
  clean: boolean;
  signature?: string;
}

export function clamavConfigured(): boolean {
  return Boolean(process.env.CLAMD_HOST);
}

export function scanBytes(bytes: Buffer): Promise<ScanResult> {
  const host = process.env.CLAMD_HOST ?? 'localhost';
  const port = Number(process.env.CLAMD_PORT ?? 3310);
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host, port });
    const chunks: Buffer[] = [];
    socket.setTimeout(60_000, () => {
      socket.destroy();
      reject(new Error('clamd timeout'));
    });
    socket.on('error', reject);
    socket.on('connect', () => {
      socket.write('zINSTREAM\0');
      const size = Buffer.alloc(4);
      size.writeUInt32BE(bytes.length, 0);
      socket.write(size);
      socket.write(bytes);
      socket.write(Buffer.from([0, 0, 0, 0])); // terminating zero-length chunk
    });
    socket.on('data', (d) => chunks.push(d));
    socket.on('close', () => {
      const reply = Buffer.concat(chunks).toString('utf8').replace(/\0/g, '').trim();
      if (reply.endsWith('OK')) return resolve({ clean: true });
      const found = reply.match(/: (.+) FOUND$/);
      if (found) return resolve({ clean: false, signature: found[1] });
      reject(new Error(`clamd unexpected reply: ${reply.slice(0, 120)}`));
    });
  });
}
