import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

type Operation = {
    _type: 0 | 1 | 2;
    _date: string;
    _amount: number;
};

type ZipEntry = {
    fileName: string;
    compressionMethod: number;
    compressedSize: number;
    uncompressedSize: number;
    localHeaderOffset: number;
};

const SELF_INN = '666201348146';
const TAX_INN = '7727406020';
const IGNORE_INN = new Set(['7734202860', SELF_INN]);

function usage(): never {
    console.error('Usage: set INPUT_ZIP=... && set OUTPUT_TS=... && tsx src/convertStatementZip.ts');
    console.error('Optional: set DRY_RUN=1');
    process.exit(1);
}

function findEndOfCentralDirectory(zip: Buffer): number {
    // End of central directory record must be located within the last 65_557 bytes.
    const minOffset = Math.max(0, zip.length - 65557);
    for (let i = zip.length - 22; i >= minOffset; i--) {
        if (zip.readUInt32LE(i) === 0x06054b50) {
            return i;
        }
    }
    throw new Error('Invalid ZIP: End of central directory record not found.');
}

function readCentralDirectory(zip: Buffer): ZipEntry[] {
    const eocd = findEndOfCentralDirectory(zip);
    const totalEntries = zip.readUInt16LE(eocd + 10);
    const centralDirectoryOffset = zip.readUInt32LE(eocd + 16);

    const entries: ZipEntry[] = [];
    let offset = centralDirectoryOffset;
    for (let i = 0; i < totalEntries; i++) {
        const signature = zip.readUInt32LE(offset);
        if (signature !== 0x02014b50) {
            throw new Error(`Invalid ZIP: bad central directory header at offset ${offset}.`);
        }

        const compressionMethod = zip.readUInt16LE(offset + 10);
        const compressedSize = zip.readUInt32LE(offset + 20);
        const uncompressedSize = zip.readUInt32LE(offset + 24);
        const fileNameLength = zip.readUInt16LE(offset + 28);
        const extraLength = zip.readUInt16LE(offset + 30);
        const fileCommentLength = zip.readUInt16LE(offset + 32);
        const localHeaderOffset = zip.readUInt32LE(offset + 42);
        const fileName = zip
            .slice(offset + 46, offset + 46 + fileNameLength)
            .toString('utf8');

        entries.push({
            fileName,
            compressionMethod,
            compressedSize,
            uncompressedSize,
            localHeaderOffset,
        });

        offset += 46 + fileNameLength + extraLength + fileCommentLength;
    }
    return entries;
}

function readZipEntryContent(zip: Buffer, entry: ZipEntry): Buffer {
    const local = entry.localHeaderOffset;
    const signature = zip.readUInt32LE(local);
    if (signature !== 0x04034b50) {
        throw new Error(`Invalid ZIP: bad local file header at offset ${local}.`);
    }

    const fileNameLength = zip.readUInt16LE(local + 26);
    const extraLength = zip.readUInt16LE(local + 28);
    const dataOffset = local + 30 + fileNameLength + extraLength;
    const compressed = zip.slice(dataOffset, dataOffset + entry.compressedSize);

    if (entry.compressionMethod === 0) {
        return compressed;
    }
    if (entry.compressionMethod === 8) {
        return zlib.inflateRawSync(compressed);
    }
    throw new Error(`Unsupported ZIP compression method: ${entry.compressionMethod}.`);
}

function decodeHtmlEntities(input: string): string {
    return input
        .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
        .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&nbsp;/g, ' ');
}

function stripTags(input: string): string {
    return input.replace(/<[^>]*>/g, ' ');
}

function normalizeText(input: string): string {
    return decodeHtmlEntities(stripTags(input)).replace(/\s+/g, ' ').trim();
}

function extractAmount(segment: string): number | null {
    const amountMatch = segment.match(/Сумма\s*<\/td>\s*<td[^>]*>\s*&nbsp;\s*([0-9\s]+)-([0-9]{2})/s);
    if (!amountMatch) {
        return null;
    }
    const whole = Number(amountMatch[1].replace(/\s+/g, ''));
    const fraction = Number(amountMatch[2]);
    if (!Number.isFinite(whole) || !Number.isFinite(fraction)) {
        return null;
    }
    return whole + fraction / 100;
}

function findLastInnBeforeLabel(segment: string, label: string): string | null {
    const labelPos = segment.indexOf(label);
    if (labelPos < 0) {
        return null;
    }
    const start = Math.max(0, labelPos - 3000);
    const window = segment.slice(start, labelPos);
    const inns = [...window.matchAll(/ИНН\s*([0-9]{10,12})/g)].map((m) => m[1]);
    return inns.length > 0 ? inns[inns.length - 1] : null;
}

function extractPurpose(segment: string): string {
    const label = 'Назначение платежа';
    const labelPos = segment.indexOf(label);
    if (labelPos < 0) {
        return '';
    }
    const start = Math.max(0, labelPos - 3500);
    const window = segment.slice(start, labelPos);
    const strongMatches = [...window.matchAll(/<strong>([\s\S]*?)<\/strong>/g)];
    if (strongMatches.length === 0) {
        return '';
    }
    return normalizeText(strongMatches[strongMatches.length - 1][1]);
}

function toIsoDate(ddmmyyyy: string): string {
    const parts = ddmmyyyy.split('.');
    if (parts.length !== 3) {
        throw new Error(`Bad date format: ${ddmmyyyy}`);
    }
    const [dd, mm, yyyy] = parts;
    return `${yyyy}-${mm}-${dd}T00:00:00.000Z`;
}

function pickExecutionDate(segment: string): string | null {
    const dates = [...segment.matchAll(/\b\d{2}\.\d{2}\.\d{4}\b/g)].map((m) => m[0]);
    if (dates.length === 0) {
        return null;
    }
    return dates[1] ?? dates[0];
}

function toOperations(html: string): Operation[] {
    const marker = '<div class="printArea printView fixedTable">';
    const starts: number[] = [];
    let searchFrom = 0;
    while (true) {
        const found = html.indexOf(marker, searchFrom);
        if (found < 0) {
            break;
        }
        starts.push(found);
        searchFrom = found + marker.length;
    }

    const operations: Operation[] = [];
    for (let i = 0; i < starts.length; i++) {
        const start = starts[i];
        const end = i + 1 < starts.length ? starts[i + 1] : html.length;
        const segment = html.slice(start, end);

        const date = pickExecutionDate(segment);
        const amount = extractAmount(segment);
        if (!date || amount == null) {
            continue;
        }

        const payerInn = findLastInnBeforeLabel(segment, 'Плательщик');
        const recipientInn = findLastInnBeforeLabel(segment, 'Получатель');
        if (!payerInn || !recipientInn) {
            continue;
        }

        if (recipientInn === SELF_INN) {
            // Incoming to our account.
            if (IGNORE_INN.has(payerInn)) {
                continue;
            }
            operations.push({
                _type: 0,
                _date: toIsoDate(date),
                _amount: amount,
            });
            continue;
        }

        if (payerInn === SELF_INN && recipientInn === TAX_INN) {
            // Outgoing tax/social payment from our account.
            const purpose = extractPurpose(segment).toUpperCase();
            const type: 1 | 2 = purpose.startsWith('ПФР') ? 2 : 1;
            operations.push({
                _type: type,
                _date: toIsoDate(date),
                _amount: amount,
            });
        }
    }

    operations.sort((a, b) => a._date.localeCompare(b._date));
    return operations;
}

function parseRequiredPayment(targetPath: string): number {
    if (!fs.existsSync(targetPath)) {
        return 0;
    }
    const source = fs.readFileSync(targetPath, 'utf8');
    const match = source.match(/requiredPayment:number\s*=\s*([0-9.]+)/);
    return match ? Number(match[1]) : 0;
}

function formatAmount(value: number): string {
    if (Number.isInteger(value)) {
        return String(value);
    }
    return value.toFixed(2).replace(/\.?0+$/, '');
}

function buildDataFile(requiredPayment: number, operations: Operation[]): string {
    const lines: string[] = [];
    lines.push(`export const requiredPayment:number = ${requiredPayment};`);
    lines.push('');
    lines.push('export const data = [');
    for (const op of operations) {
        lines.push(`    { _type: ${op._type}, _date: '${op._date}', _amount: ${formatAmount(op._amount)} },`);
    }
    lines.push('');
    lines.push('  ]');
    lines.push('');
    return lines.join('\n');
}

function main(): void {
    const inputZip = process.env.INPUT_ZIP;
    if (!inputZip) {
        usage();
    }
    const outPath = process.env.OUTPUT_TS ?? 'data/2026.ts';
    const dryRun = process.env.DRY_RUN === '1' || process.env.DRY_RUN?.toLowerCase() === 'true';

    const zipBuffer = fs.readFileSync(inputZip);
    const entries = readCentralDirectory(zipBuffer);
    const htmlEntry = entries.find((e) => e.fileName.toLowerCase().endsWith('.html'));
    if (!htmlEntry) {
        throw new Error('No .html file found in ZIP.');
    }

    const htmlBuffer = readZipEntryContent(zipBuffer, htmlEntry);
    const html = htmlBuffer.toString('utf8');
    const operations = toOperations(html);

    const outputFile = path.resolve(outPath);
    const requiredPayment = parseRequiredPayment(outputFile);
    const content = buildDataFile(requiredPayment, operations);

    if (dryRun) {
        process.stdout.write(content);
        return;
    }

    fs.writeFileSync(outputFile, content, 'utf8');
    console.log(`Wrote ${operations.length} operations to ${outputFile}`);
}

main();
