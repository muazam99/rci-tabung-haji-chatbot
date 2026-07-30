/**
 * Stage 1, step 3 — chunks.json -> index.json
 *
 * The document's "map": every heading path plus a one-line summary, target
 * ~2k tokens total so it can always sit in the prompt. This is what lets the
 * model correctly say "that's covered in Bab 4" for a question whose actual
 * content didn't make it into the retrieved chunks, instead of inventing an
 * answer — the whole point of always including it (see the build plan's
 * grounding rules).
 *
 * The plan's original design generates these summaries via one batched
 * model call. That was skipped here: writing this script required reading
 * every section's actual opening paragraphs anyway (to get the heading
 * structure right upstream in scripts/1-extract.ts and scripts/2-chunk.ts),
 * so the summaries below are hand-written directly from that reading rather
 * than round-tripped through an API call — arguably a stronger form of the
 * "hand-reviewed" step the plan already asks for, and it doesn't block this
 * script on a DeepSeek API key being configured yet. If the report content
 * ever changes, prefer re-reading and re-writing SUMMARIES over trusting a
 * generated pass blindly.
 *
 * Heading paths and page ranges are still derived programmatically from
 * chunks.json, not hand-typed, so they can't drift from the real structure.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const CHUNKS_PATH = join(process.cwd(), "data", "chunks.json");
const INDEX_PATH = join(process.cwd(), "data", "index.json");

interface Chunk {
  headingPath: string;
  pages: string;
}

/** Hand-written, one line per heading path (see file header for why). */
const SUMMARIES: Record<string, string> = {
  "Penghargaan":
    "Penghargaan Pengerusi Suruhanjaya kepada pihak-pihak yang membantu penyiapan laporan.",
  "Ringkasan Eksekutif":
    "Ringkasan latar belakang penubuhan Suruhanjaya, objektif, skop, metodologi siasatan dan rumusan keseluruhan penemuan serta syor.",
  "Ringkasan Eksekutif › Penutup":
    "Penutup ringkasan eksekutif — seruan kepada Kerajaan dan LTH memberi perhatian serius kepada penambahbaikan yang disyorkan.",
  "Senarai Definisi dan Singkatan":
    "Glosari istilah, akta dan singkatan yang digunakan sepanjang laporan (contoh: LTH, BNM, UJSB, Akta 535).",

  "Bab 1 — Pengenalan":
    "Penubuhan Suruhanjaya, objektif, skop siasatan, keahlian Pesuruhjaya, tempoh, prosedur dan metodologi siasatan.",
  "Bab 1 — Pengenalan › 1.1 Latar Belakang Penubuhan Suruhanjaya":
    "Latar belakang penubuhan Suruhanjaya susulan perbahasan Parlimen dan keputusan Jemaah Menteri 2020-2021 mengenai isu pengurusan dan operasi LTH.",
  "Bab 1 — Pengenalan › 1.2 Objektif":
    "Objektif Suruhanjaya: menyiasat isu pengurusan dan operasi LTH dari tahun 2014 hingga 2020.",
  "Bab 1 — Pengenalan › 1.3 Skop":
    "Skop siasatan meliputi penemuan PwC/EY/RB, penyembunyian maklumat, kenyataan mengelirukan, dan cadangan tindakan yang sesuai.",
  "Bab 1 — Pengenalan › 1.4 Pesuruhjaya":
    "Senarai enam Pesuruhjaya yang dilantik oleh KDYMM Seri Paduka Baginda Yang di-Pertuan Agong pada 20 Januari 2022.",
  "Bab 1 — Pengenalan › 1.5 Tempoh Kuat Kuasa":
    "Tempoh kuat kuasa pelantikan Suruhanjaya: enam bulan, 20 Januari hingga 19 Julai 2022.",
  "Bab 1 — Pengenalan › 1.6 Prosiding":
    "Prosiding siasatan Suruhanjaya dijalankan secara tertutup.",
  "Bab 1 — Pengenalan › 1.7 Lokasi Prosiding":
    "Lokasi prosiding: Bilik Mesyuarat, Kompleks Islam Putrajaya.",
  "Bab 1 — Pengenalan › 1.8 Kuorum":
    "Kuorum mesyuarat Suruhanjaya ditetapkan pada lima orang Pesuruhjaya.",
  "Bab 1 — Pengenalan › 1.9 Kerahsiaan":
    "Kerahsiaan prosiding di bawah Akta Suruhanjaya Siasatan 1950 dan Akta Rahsia Rasmi 1972.",
  "Bab 1 — Pengenalan › 1.10 Sekretariat":
    "Sekretariat Suruhanjaya: Jabatan Kemajuan Islam Malaysia (JAKIM).",
  "Bab 1 — Pengenalan › 1.11 Prosedur Operasi Standard":
    "Prosedur Operasi Standard (SOP) bagi peringkat pra-, semasa dan pasca-prosiding siasatan.",
  "Bab 1 — Pengenalan › 1.12 Pendekatan dan Metodologi Siasatan":
    "Empat pendekatan metodologi siasatan, termasuk pengumpulan rekod dan dokumen, bagi mencapai objektif siasatan.",

  "Bab 2 — Latar Belakang Pengurusan dan Operasi Lembaga Tabung Haji":
    "Sejarah penubuhan LTH sejak Ordinan Haji 1951, serta fungsi, kawal selia, pentadbiran, pengurusan dan operasi LTH di bawah Akta 535.",
  "Bab 2 — Latar Belakang Pengurusan dan Operasi Lembaga Tabung Haji › 2.1 Sejarah Penubuhan Lembaga Tabung Haji":
    "Sejarah penubuhan LTH bermula Ordinan Haji 1951, PWSBH, LUTH, sehingga menjadi LTH di bawah Akta 535.",
  "Bab 2 — Latar Belakang Pengurusan dan Operasi Lembaga Tabung Haji › 2.2 Fungsi, Kawal Selia, Pentadbiran, Pengurusan dan Operasi Lembaga Tabung Haji":
    "Fungsi LTH di bawah seksyen 4(1) Akta 535 — mentadbir Kumpulan Wang dan kebajikan jemaah haji — serta struktur kawal selia dan pentadbirannya.",

  "Bab 3 — Penemuan dan Cadangan":
    "Bahagian utama laporan — penemuan Suruhanjaya merentasi tadbir urus Lembaga, kawal selia BNM, deposit, hibah, pelaporan kewangan, bonus, UJSB, pelaburan bermasalah, laporan kepada agensi penguatkuasaan dan penambahbaikan LTH, bersama cadangan penambahbaikan.",
  "Bab 3 — Penemuan dan Cadangan › 3.1 Pendahuluan":
    "Pendahuluan Bab Tiga — menghubungkan metodologi Bab Satu dengan penemuan dan cadangan yang dibentangkan.",
  "Bab 3 — Penemuan dan Cadangan › 3.2 Tadbir Urus Lembaga Tabung Haji":
    "Tadbir urus Lembaga — pelantikan Pengerusi/anggota Lembaga oleh Menteri, isu keahlian Lembaga, dan cadangan kriteria pelantikan.",
  "Bab 3 — Penemuan dan Cadangan › 3.3 Penglibatan Anggota Lembaga dalam Anak-Anak Syarikat":
    "Penglibatan Pengerusi dan anggota Lembaga sebagai Pengerusi/Ahli Lembaga Pengarah dalam banyak anak syarikat LTH.",
  "Bab 3 — Penemuan dan Cadangan › 3.4 Ketua Pegawai Eksekutif Lembaga Tabung Haji dan Pegawai Pengurusan Dalam Anak Syarikat":
    "Ketua Pegawai Eksekutif dan pegawai pengurusan kanan LTH turut menyandang jawatan dalam anak-anak syarikat LTH.",
  "Bab 3 — Penemuan dan Cadangan › 3.5 Jawatankuasa-Jawatankuasa Lembaga":
    "Jawatankuasa-jawatankuasa Lembaga (Panel Pelaburan, Jawatankuasa Penasihat Syariah, Jawatankuasa Urusan Haji) dan cadangan pengkanunan dalam Akta 535.",
  "Bab 3 — Penemuan dan Cadangan › 3.6 Kawal Selia Bank Negara Malaysia ke atas Lembaga Tabung Haji":
    "LTH sebagai Institusi Kewangan Bukan Bank diletakkan di bawah kawal selia pentadbiran BNM mulai 2019; Suruhanjaya mendapati ini tidak selari dengan Akta 535.",
  "Bab 3 — Penemuan dan Cadangan › 3.7 Pengurusan Deposit":
    "Pengurusan deposit — perlindungan berkanun ke atas deposit, pengaruh zakat dalam memobilisasi deposit, dan risiko tertumpu (concentration risk).",
  "Bab 3 — Penemuan dan Cadangan › 3.8 Perlindungan Pelaburan":
    "Perlindungan pelaburan — kuasa pelaburan LTH memerlukan keizinan Menteri di bawah seksyen 20 Akta 535.",
  "Bab 3 — Penemuan dan Cadangan › 3.9 Pengagihan Keuntungan (Hibah)":
    "Pengagihan keuntungan (hibah) 2014-2017 dan kadar pengagihan hibah — isu pengagihan hibah melebihi keuntungan sebenar.",
  "Bab 3 — Penemuan dan Cadangan › 3.10 Pelaporan Kewangan":
    "Pelaporan kewangan LTH sebagai badan berkanun di bawah Akta Badan Berkanun (Akaun dan Laporan Tahunan) 1980 [Akta 240].",
  "Bab 3 — Penemuan dan Cadangan › 3.11 Laporan Penyata Kewangan yang Diaudit oleh Jabatan Audit Negara":
    "Penyata kewangan LTH 2014-2017 diberi Sijil Audit Bersih oleh Jabatan Audit Negara walaupun terdapat 'Emphasis of Matter' pada 2017.",
  "Bab 3 — Penemuan dan Cadangan › 3.12 Bonus":
    "Bonus kakitangan LTH dan bonus Lembaga Pengarah TH Properties/THP Australia — kelulusan dan kadar bonus.",
  "Bab 3 — Penemuan dan Cadangan › 3.13 Pelan Pemulihan Lembaga Tabung Haji 2018 dan Penubuhan Urusharta Jamaah Sdn. Bhd.":
    "Pelan Pemulihan LTH 2018, penubuhan Urusharta Jamaah Sdn. Bhd. (UJSB), dan pelupusan aset LTH yang dipindahkan kepada UJSB.",
  "Bab 3 — Penemuan dan Cadangan › 3.14 Pelaburan yang Bermasalah":
    "Pelaburan-pelaburan LTH yang bermasalah — transaksi mencurigakan, penyembunyian maklumat, dan proses membuat keputusan pelaburan yang tidak teratur.",
  "Bab 3 — Penemuan dan Cadangan › 3.15 Laporan-Laporan Lembaga Tabung Haji kepada Agensi- Agensi Penguatkuasaan Undang-Undang":
    "Laporan-laporan LTH kepada agensi penguatkuasaan — laporan polis, tindakan tatatertib, laporan kepada SPRM, dan tindakan mahkamah/timbang tara.",
  "Bab 3 — Penemuan dan Cadangan › 3.16 Tanggungan Bantuan Kewangan Haji":
    "Peningkatan kos haji dari tahun ke tahun dan tanggungan Bantuan Kewangan Haji (HAFIS) LTH.",
  "Bab 3 — Penemuan dan Cadangan › 3.17 Penambahbaikan Lembaga Tabung Haji dari Tahun 2017 hingga Sekarang":
    "Penambahbaikan LTH dari 2017 sehingga sekarang — perundingan model pengurusan LTH dengan perunding luar.",
  "Bab 3 — Penemuan dan Cadangan › 3.18 Pandangan Suruhanjaya":
    "Pandangan Suruhanjaya mengenai struktur LTH, dapatan laporan Roland Berger/Ernst & Young, dan cadangan penubuhan Dana Haji berasingan.",

  "Bab 4 — Rumusan":
    "Rumusan pencapaian dan cabaran LTH, disusuli 25 syor Suruhanjaya (§4.4.1-§4.4.25) merangkumi pindaan Akta 535, tadbir urus, kawal selia dan penubuhan Dana Haji.",
  "Bab 4 — Rumusan › Penutup":
    "Penutup Bab Empat — seruan Suruhanjaya kepada Kerajaan supaya laporan ini diumumkan kepada awam.",

  "Senarai Ekshibit":
    "Senarai ekshibit dan jilid keterangan yang dikemukakan dalam siasatan Suruhanjaya (sebahagian besar diklasifikasikan rahsia).",
};

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function pagesUnion(pages: string[]): string {
  const nums = pages.flatMap((p) => p.split("-").map(Number)).filter((n) => !Number.isNaN(n));
  if (nums.length === 0) return pages[0] ?? "";
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  return min === max ? String(min) : `${min}-${max}`;
}

function main() {
  const chunks: Chunk[] = JSON.parse(readFileSync(CHUNKS_PATH, "utf-8"));

  const byHeading = new Map<string, string[]>();
  const order: string[] = [];
  for (const c of chunks) {
    if (!byHeading.has(c.headingPath)) {
      byHeading.set(c.headingPath, []);
      order.push(c.headingPath);
    }
    byHeading.get(c.headingPath)!.push(c.pages);
  }

  // Chapter-level rollups for Bab 1-3: these chapters' bare H1 (no section)
  // has zero content of its own — the divider page is discarded entirely by
  // scripts/1-extract.ts — so it never appears in chunks.json. Still worth
  // an index entry, as a chapter-level map marker; page range and order
  // synthesized from its children instead of read off a chunk.
  for (const chapterHeading of [
    "Bab 1 — Pengenalan",
    "Bab 2 — Latar Belakang Pengurusan dan Operasi Lembaga Tabung Haji",
    "Bab 3 — Penemuan dan Cadangan",
  ] as const) {
    if (byHeading.has(chapterHeading)) continue;
    const childPages = order
      .filter((h) => h.startsWith(chapterHeading + " ›"))
      .flatMap((h) => byHeading.get(h)!);
    byHeading.set(chapterHeading, childPages);
    // Insert right before its first child so document order stays intact.
    const firstChildIdx = order.findIndex((h) => h.startsWith(chapterHeading + " ›"));
    order.splice(firstChildIdx === -1 ? order.length : firstChildIdx, 0, chapterHeading);
  }

  const entries = order.map((headingPath) => {
    const summary = SUMMARIES[headingPath];
    if (!summary) {
      throw new Error(
        `No hand-written summary for heading path "${headingPath}" — the document structure ` +
          `changed (re-ran scripts/1-extract.ts or 2-chunk.ts against a different PDF?). ` +
          `Add a SUMMARIES entry for it in scripts/3-index.ts.`
      );
    }
    return {
      headingPath,
      pages: pagesUnion(byHeading.get(headingPath)!),
      summary,
    };
  });

  const staleSummaries = Object.keys(SUMMARIES).filter((h) => !order.includes(h));
  if (staleSummaries.length > 0) {
    console.warn(
      `Warning: ${staleSummaries.length} SUMMARIES entries no longer match any heading path ` +
        `(stale after a re-extraction?): ${staleSummaries.join(", ")}`
    );
  }

  writeFileSync(INDEX_PATH, JSON.stringify(entries, null, 2), "utf-8");
  const totalTokens = estimateTokens(JSON.stringify(entries));
  console.log(`Wrote ${INDEX_PATH} (${entries.length} entries, ~${totalTokens} tokens)`);
  if (totalTokens > 3000) {
    console.warn(`Warning: index.json is larger than the ~2k token target (${totalTokens}).`);
  }
}

main();
