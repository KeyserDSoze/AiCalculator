import jsPDF from 'jspdf';

export interface PremiumPdfData {
  it: boolean;
  generatedAt: Date;
  catalogUpdated?: string;
  input: any;
  selectedModel: any;
  onPrem: any;
  colo: any;
  rental: any;
  businessDecision: any;
  modelRecommendations: any[];
  recommendations: Array<{ kind: string; title: string; subtitle: string; assessment: any }>;
  selectedAssessment?: any;
  cloudOffers: any[];
  purchaseOffers: any[];
}

type RGB = [number, number, number];

const C = {
  ink: [18, 29, 51] as RGB,
  muted: [101, 116, 145] as RGB,
  faint: [232, 237, 247] as RGB,
  paper: [248, 250, 254] as RGB,
  white: [255, 255, 255] as RGB,
  navy: [8, 15, 30] as RGB,
  navy2: [15, 25, 46] as RGB,
  indigo: [103, 132, 246] as RGB,
  indigoSoft: [232, 237, 255] as RGB,
  green: [68, 190, 150] as RGB,
  greenSoft: [229, 249, 241] as RGB,
  amber: [219, 158, 53] as RGB,
  amberSoft: [253, 245, 225] as RGB,
  red: [220, 80, 104] as RGB,
  redSoft: [253, 233, 238] as RGB,
  slate: [44, 60, 88] as RGB
};

const PAGE_W = 210;
const PAGE_H = 297;
const M = 14;
const CONTENT_W = PAGE_W - M * 2;

function txt(value: unknown) {
  return String(value ?? '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u00a0/g, ' ')
    .replace(/✓/g, 'OK')
    .replace(/⚠/g, '!');
}

function money(value: number, compact = false) {
  const n = Number(value) || 0;
  if (compact && Math.abs(n) >= 1_000_000) return `EUR ${(n / 1_000_000).toFixed(2)}M`;
  if (compact && Math.abs(n) >= 1_000) return `EUR ${(n / 1_000).toFixed(0)}k`;
  return `EUR ${Math.round(n).toLocaleString('it-IT')}`;
}

function num(value: number, digits = 0) {
  return (Number(value) || 0).toLocaleString('it-IT', { maximumFractionDigits: digits });
}

function setFill(doc: jsPDF, color: RGB) { doc.setFillColor(color[0], color[1], color[2]); }
function setDraw(doc: jsPDF, color: RGB) { doc.setDrawColor(color[0], color[1], color[2]); }
function setText(doc: jsPDF, color: RGB) { doc.setTextColor(color[0], color[1], color[2]); }

function rounded(doc: jsPDF, x: number, y: number, w: number, h: number, fill: RGB, radius = 3, stroke?: RGB) {
  setFill(doc, fill);
  if (stroke) {
    setDraw(doc, stroke);
    doc.setLineWidth(0.35);
    doc.roundedRect(x, y, w, h, radius, radius, 'FD');
  } else doc.roundedRect(x, y, w, h, radius, radius, 'F');
}

function drawBrandMark(doc: jsPDF, x: number, y: number, dark = true) {
  const bg = dark ? C.indigo : C.navy;
  rounded(doc, x, y, 13, 13, bg, 3.2);
  setDraw(doc, C.white);
  doc.setLineWidth(0.75);
  doc.line(x + 3.1, y + 8.9, x + 5.3, y + 4.2);
  doc.line(x + 5.3, y + 4.2, x + 7.1, y + 8.8);
  doc.line(x + 7.1, y + 8.8, x + 9.8, y + 5.7);
  setFill(doc, C.white);
  doc.circle(x + 3.1, y + 8.9, 0.8, 'F');
  doc.circle(x + 5.3, y + 4.2, 0.8, 'F');
  doc.circle(x + 7.1, y + 8.8, 0.8, 'F');
  doc.circle(x + 9.8, y + 5.7, 0.8, 'F');
}

function pill(doc: jsPDF, text: string, x: number, y: number, fill: RGB, color: RGB, width?: number) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  const w = width || Math.max(19, doc.getTextWidth(txt(text)) + 8);
  rounded(doc, x, y, w, 7, fill, 3.5);
  setText(doc, color);
  doc.text(txt(text), x + w / 2, y + 4.7, { align: 'center' });
  return w;
}

function pageHeader(doc: jsPDF, section: string, pageNo?: string) {
  drawBrandMark(doc, M, 9.5, false);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  setText(doc, C.ink);
  doc.text('AI Strategy Calculator', M + 17, 15);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  setText(doc, C.muted);
  doc.text(txt(section).toUpperCase(), PAGE_W - M, 15, { align: 'right' });
  setDraw(doc, C.faint);
  doc.setLineWidth(0.4);
  doc.line(M, 21, PAGE_W - M, 21);
  if (pageNo) doc.text(pageNo, PAGE_W - M, PAGE_H - 8, { align: 'right' });
}

function sectionTitle(doc: jsPDF, eyebrow: string, title: string, subtitle: string, y: number) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  setText(doc, C.indigo);
  doc.text(txt(eyebrow).toUpperCase(), M, y);
  doc.setFontSize(20);
  setText(doc, C.ink);
  doc.text(txt(title), M, y + 9);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  setText(doc, C.muted);
  const lines = doc.splitTextToSize(txt(subtitle), CONTENT_W);
  doc.text(lines, M, y + 15);
  return y + 15 + lines.length * 4.2;
}

function kpiCard(doc: jsPDF, x: number, y: number, w: number, label: string, value: string, hint?: string, accent: RGB = C.indigo) {
  rounded(doc, x, y, w, 28, C.white, 3.5, C.faint);
  setFill(doc, accent);
  doc.roundedRect(x, y, 2.2, 28, 1.1, 1.1, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  setText(doc, C.muted);
  doc.text(txt(label).toUpperCase(), x + 6, y + 7);
  doc.setFontSize(14);
  setText(doc, C.ink);
  doc.text(txt(value), x + 6, y + 16);
  if (hint) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.3);
    setText(doc, C.muted);
    const lines = doc.splitTextToSize(txt(hint), w - 12).slice(0, 2);
    doc.text(lines, x + 6, y + 22);
  }
}

function bar(doc: jsPDF, x: number, y: number, w: number, label: string, value: number, max: number, color: RGB, suffix = '') {
  const ratio = Math.max(0.02, Math.min(1, max > 0 ? value / max : 0));
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  setText(doc, C.ink);
  doc.text(txt(label), x, y);
  doc.setFont('helvetica', 'normal');
  setText(doc, C.muted);
  doc.text(`${num(value)}${suffix}`, x + w, y, { align: 'right' });
  rounded(doc, x, y + 2.5, w, 4, C.faint, 2);
  rounded(doc, x, y + 2.5, w * ratio, 4, color, 2);
}

function scoreBar(doc: jsPDF, x: number, y: number, w: number, label: string, value: number, color: RGB = C.indigo) {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  setText(doc, C.muted);
  doc.text(txt(label), x, y);
  rounded(doc, x + 18, y - 2.5, w - 28, 3.2, C.faint, 1.6);
  rounded(doc, x + 18, y - 2.5, (w - 28) * Math.max(0, Math.min(100, Number(value) || 0)) / 100, 3.2, color, 1.6);
  doc.setFont('helvetica', 'bold');
  setText(doc, C.ink);
  doc.text(`${Math.round(Number(value) || 0)}`, x + w, y, { align: 'right' });
}

function fitColors(status: string): { fill: RGB; text: RGB } {
  if (status === 'top') return { fill: C.greenSoft, text: [31, 139, 105] };
  if (status === 'recommended') return { fill: C.indigoSoft, text: [61, 91, 190] };
  if (status === 'strained') return { fill: C.amberSoft, text: [159, 107, 22] };
  return { fill: C.redSoft, text: [175, 54, 77] };
}

function labelFit(status: string, it: boolean) {
  if (status === 'top') return 'TOP';
  if (status === 'recommended') return it ? 'CONSIGLIATO' : 'RECOMMENDED';
  if (status === 'strained') return it ? 'SOTTO SFORZO' : 'STRAINED';
  return it ? 'IMPOSSIBILE' : 'IMPOSSIBLE';
}

function scenarioLabel(id: string, it: boolean) {
  if (id === 'onprem') return 'ON-PREM';
  if (id === 'colo') return 'COLOCATION';
  if (id === 'rental') return 'CLOUD';
  return it ? 'IBRIDO' : 'HYBRID';
}

function addFooter(doc: jsPDF, data: PremiumPdfData) {
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    if (i === 1) setText(doc, [144, 159, 189]); else setText(doc, C.muted);
    const left = data.it ? 'Planning report - verificare benchmark e preventivi prima del procurement' : 'Planning report - validate benchmarks and quotes before procurement';
    doc.text(left, M, PAGE_H - 7.5);
    doc.text(`${i}/${total}`, PAGE_W - M, PAGE_H - 7.5, { align: 'right' });
  }
}

function reasonList(doc: jsPDF, items: string[], x: number, y: number, w: number, color: RGB = C.ink, maxItems = 4) {
  let yy = y;
  items.slice(0, maxItems).forEach(item => {
    setFill(doc, C.green);
    doc.circle(x + 1.6, yy - 1.1, 1.2, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.1);
    setText(doc, color);
    const lines = doc.splitTextToSize(txt(item), w - 7).slice(0, 3);
    doc.text(lines, x + 5, yy);
    yy += lines.length * 3.9 + 3.2;
  });
  return yy;
}

function drawCover(doc: jsPDF, data: PremiumPdfData) {
  const t = (a: string, b: string) => data.it ? a : b;
  setFill(doc, C.navy);
  doc.rect(0, 0, PAGE_W, PAGE_H, 'F');
  setFill(doc, [16, 30, 56]);
  doc.circle(188, 26, 55, 'F');
  setFill(doc, [13, 42, 61]);
  doc.circle(18, 272, 48, 'F');
  setFill(doc, [25, 37, 69]);
  doc.roundedRect(101, 52, 102, 78, 18, 18, 'F');

  drawBrandMark(doc, M, 15, true);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  setText(doc, C.white);
  doc.text('AI Strategy Calculator', M + 18, 23);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  setText(doc, [154, 169, 200]);
  doc.text(t('REPORT DECISIONALE AZIENDALE', 'ENTERPRISE DECISION REPORT'), M, 46);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(29);
  setText(doc, C.white);
  doc.text(t('AI Strategy', 'AI Strategy'), M, 62);
  doc.text(t('Report', 'Report'), M, 74);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  setText(doc, [164, 179, 210]);
  const intro = t('Strategia, modelli, infrastruttura, resilienza, costi e fornitori in un unico business case.', 'Strategy, models, infrastructure, resilience, economics and providers in one business case.');
  doc.text(doc.splitTextToSize(intro, 78), M, 87);

  const strategy = txt(data.businessDecision?.recommendedLabel || 'Strategy');
  rounded(doc, 108, 61, 87, 61, [18, 31, 57], 5, [50, 72, 116]);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.4);
  setText(doc, [130, 153, 221]);
  doc.text(t('STRATEGIA RACCOMANDATA', 'RECOMMENDED STRATEGY'), 116, 73);
  doc.setFontSize(22);
  setText(doc, C.white);
  doc.text(strategy, 116, 88);
  pill(doc, `${Math.round(data.businessDecision?.confidencePct || 0)}% CONFIDENCE`, 116, 96, [36, 59, 91], [151, 220, 194], 39);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.1);
  setText(doc, [157, 173, 203]);
  const why = data.businessDecision?.reasons?.[0] || t('Strategia costruita sui parametri correnti.', 'Strategy based on the current workload.');
  doc.text(doc.splitTextToSize(txt(why), 69).slice(0, 3), 116, 110);

  const y = 145;
  const gap = 5;
  const w = (CONTENT_W - gap * 3) / 4;
  const cards = [
    [t('MODELLO', 'MODEL'), txt(data.selectedModel?.name || '-'), `${data.selectedModel?.parametersTotalB || 0}B total`],
    [t('HARDWARE', 'HARDWARE'), `${data.onPrem?.inferenceNodes || 0} nodi`, `${data.onPrem?.totalGpuCount || 0} GPU`],
    ['TCO 4Y', money(data.businessDecision?.recommendedFourYearCostEur || 0, true), strategy],
    ['N-1', data.onPrem?.n1Pass ? 'PASS' : 'FAIL', `~${data.onPrem?.n1ConcurrentCapacity || 0} ${t('sessioni', 'sessions')}`]
  ];
  cards.forEach((card, i) => {
    rounded(doc, M + i * (w + gap), y, w, 34, [16, 27, 49], 4, [41, 58, 91]);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    setText(doc, [123, 145, 191]);
    doc.text(card[0], M + i * (w + gap) + 5, y + 8);
    doc.setFontSize(11.5);
    setText(doc, C.white);
    const v = doc.splitTextToSize(card[1], w - 10).slice(0, 2);
    doc.text(v, M + i * (w + gap) + 5, y + 18);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.7);
    setText(doc, [144, 160, 192]);
    doc.text(doc.splitTextToSize(card[2], w - 10).slice(0, 1), M + i * (w + gap) + 5, y + 29);
  });

  rounded(doc, M, 194, CONTENT_W, 55, [13, 24, 44], 5, [38, 57, 91]);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  setText(doc, [124, 149, 217]);
  doc.text(t('WORKLOAD SNAPSHOT', 'WORKLOAD SNAPSHOT'), M + 7, 206);
  const snapshot = [
    [t('Utenti', 'Users'), num(data.input?.averageUsers)],
    [t('Contemporanei', 'Concurrent'), num(data.input?.concurrentUsers)],
    [t('Context medio', 'Average context'), `${num(data.input?.averageContextTokens)} tok`],
    [t('Context max', 'Max context'), `${num(data.input?.maxContextTokens)} tok`],
    [t('Output medio', 'Average output'), `${num(data.input?.averageOutputTokens)} tok`],
    [t('Dati', 'Data'), txt(data.input?.dataSensitivity || '-')]
  ];
  const sw = (CONTENT_W - 14) / 6;
  snapshot.forEach((s, i) => {
    const x = M + 7 + i * sw;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    setText(doc, [124, 141, 175]);
    doc.text(s[0].toUpperCase(), x, 219);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.2);
    setText(doc, C.white);
    doc.text(doc.splitTextToSize(s[1], sw - 4).slice(0, 2), x, 228);
  });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  setText(doc, [118, 136, 170]);
  const date = data.generatedAt.toLocaleString(data.it ? 'it-IT' : 'en-GB');
  doc.text(`${t('Generato', 'Generated')}: ${date}`, M, 269);
  if (data.catalogUpdated) doc.text(`${t('Catalogo dati', 'Data catalog')}: ${data.catalogUpdated}`, M, 275);
  doc.setFont('helvetica', 'bold');
  setText(doc, [144, 165, 221]);
  doc.text('AI Strategy Calculator', PAGE_W - M, 275, { align: 'right' });
}

function drawExecutive(doc: jsPDF, data: PremiumPdfData) {
  const t = (a: string, b: string) => data.it ? a : b;
  doc.addPage();
  pageHeader(doc, t('Executive summary', 'Executive summary'));
  let y = sectionTitle(doc, t('01 / DECISIONE', '01 / DECISION'), t('Executive summary', 'Executive summary'), t('La scelta consigliata, i costi e la ragione architetturale in una pagina.', 'The recommended choice, economics and architecture rationale on one page.'), 31);
  y += 5;

  rounded(doc, M, y, CONTENT_W, 45, C.navy2, 5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  setText(doc, [132, 154, 218]);
  doc.text(t('RACCOMANDAZIONE', 'RECOMMENDATION'), M + 8, y + 10);
  doc.setFontSize(21);
  setText(doc, C.white);
  doc.text(txt(data.businessDecision?.recommendedLabel || '-'), M + 8, y + 23);
  pill(doc, `${Math.round(data.businessDecision?.confidencePct || 0)}%`, M + 8, y + 29, [35, 57, 90], [145, 224, 193], 20);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  setText(doc, [176, 190, 215]);
  const why = data.businessDecision?.reasons?.[0] || '';
  doc.text(doc.splitTextToSize(txt(why), 105).slice(0, 3), M + 37, y + 33);
  y += 53;

  const kw = (CONTENT_W - 12) / 4;
  kpiCard(doc, M, y, kw, t('TCO raccomandato 4a', 'Recommended 4y TCO'), money(data.businessDecision?.recommendedFourYearCostEur || 0, true), txt(data.businessDecision?.recommendedLabel || ''), C.indigo);
  kpiCard(doc, M + kw + 4, y, kw, t('Risparmio vs oggi', 'Savings vs today'), money(data.businessDecision?.savingsFourYearEur || 0, true), data.input?.currentAnnualAiSpendEur > 0 ? t('orizzonte 4 anni', '4-year horizon') : t('spend attuale non impostato', 'current spend not set'), C.green);
  kpiCard(doc, M + (kw + 4) * 2, y, kw, t('Break-even', 'Break-even'), data.businessDecision?.breakEvenMonths ? `${Math.round(data.businessDecision.breakEvenMonths)} ${t('mesi', 'months')}` : '-', t('on-prem vs spend corrente', 'on-prem vs current spend'), C.amber);
  kpiCard(doc, M + (kw + 4) * 3, y, kw, 'N-1', data.onPrem?.n1Pass ? 'PASS' : 'FAIL', `~${data.onPrem?.n1ConcurrentCapacity || 0} ${t('sessioni residue', 'remaining sessions')}`, data.onPrem?.n1Pass ? C.green : C.red);
  y += 38;

  rounded(doc, M, y, 91, 76, C.white, 4, C.faint);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); setText(doc, C.ink);
  doc.text(t('TCO comparato a 4 anni', '4-year TCO comparison'), M + 7, y + 11);
  const scenarios = [
    { label: 'ON-PREM', value: data.onPrem?.fourYearTcoEur || 0, color: C.indigo },
    { label: 'COLOCATION', value: data.colo?.fourYearTcoEur || 0, color: C.slate },
    { label: 'CLOUD', value: data.rental?.fourYearTcoEur || 0, color: C.amber },
    { label: 'HYBRID', value: data.businessDecision?.hybridFourYearEur || 0, color: C.green }
  ];
  const max = Math.max(...scenarios.map(s => s.value), 1);
  scenarios.forEach((s, i) => bar(doc, M + 7, y + 23 + i * 12, 77, s.label, Math.round(s.value / 1000), Math.round(max / 1000), s.color, 'k'));

  rounded(doc, M + 97, y, CONTENT_W - 97, 76, C.white, 4, C.faint);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); setText(doc, C.ink);
  doc.text(t('Architettura raccomandata', 'Recommended architecture'), M + 104, y + 11);
  doc.setFontSize(14);
  doc.text(`${data.onPrem?.inferenceNodes || 0} x ${txt(data.onPrem?.serverName || '-')}`, M + 104, y + 24);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); setText(doc, C.muted);
  doc.text(`${data.onPrem?.totalGpuCount || 0} GPU | ${num(data.onPrem?.totalVramGb || 0)} GB VRAM | ${num(data.onPrem?.estimatedAverageKw || 0, 1)} kW avg`, M + 104, y + 32);
  doc.text(`${data.onPrem?.proxyServers || 0} x LLMProxy | ~${data.onPrem?.controlPlaneStorageTb || 0} TB audit storage`, M + 104, y + 39);
  const colors = fitColors(data.onPrem?.hardwareFit || 'recommended');
  pill(doc, labelFit(data.onPrem?.hardwareFit || 'recommended', data.it), M + 104, y + 46, colors.fill, colors.text);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.6); setText(doc, C.muted);
  const archReason = data.selectedAssessment?.reasons?.[0] || data.onPrem?.notes?.[0] || '';
  doc.text(doc.splitTextToSize(txt(archReason), CONTENT_W - 112).slice(0, 3), M + 104, y + 59);
  y += 84;

  rounded(doc, M, y, CONTENT_W, 50, C.white, 4, C.faint);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); setText(doc, C.ink);
  doc.text(t('Perche questa scelta', 'Why this choice'), M + 7, y + 11);
  reasonList(doc, data.businessDecision?.reasons || [], M + 7, y + 22, CONTENT_W - 14, C.ink, 4);
}

function drawModels(doc: jsPDF, data: PremiumPdfData) {
  const t = (a: string, b: string) => data.it ? a : b;
  doc.addPage();
  pageHeader(doc, t('Model strategy', 'Model strategy'));
  let y = sectionTitle(doc, '02 / MODEL STRATEGY', t('Modelli e routing', 'Models and routing'), t('Qualita, efficienza e ruolo del modello nel portafoglio aziendale.', 'Capability, efficiency and the role of each model in the enterprise portfolio.'), 31);
  y += 5;

  rounded(doc, M, y, CONTENT_W, 54, C.navy2, 5);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7); setText(doc, [132, 154, 218]);
  doc.text(t('MODELLO SELEZIONATO', 'SELECTED MODEL'), M + 8, y + 10);
  doc.setFontSize(18); setText(doc, C.white);
  doc.text(txt(data.selectedModel?.name || '-'), M + 8, y + 24);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); setText(doc, [166, 181, 208]);
  const active = data.selectedModel?.parametersActiveB || data.selectedModel?.parametersTotalB || 0;
  doc.text(`${data.selectedModel?.vendor || '-'} | ${data.selectedModel?.parametersTotalB || 0}B total | ${active}B active | ${Math.round((data.selectedModel?.maxExtendedContextTokens || 0) / 1000)}K context`, M + 8, y + 33);
  const b = data.selectedModel?.benchmarks || {};
  scoreBar(doc, M + 108, y + 14, 64, 'Coding', b.coding || 0, C.indigo);
  scoreBar(doc, M + 108, y + 25, 64, 'General', b.general || 0, C.green);
  scoreBar(doc, M + 108, y + 36, 64, 'Thinking', b.thinking || 0, C.amber);
  y += 63;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); setText(doc, C.ink);
  doc.text(t('Shortlist consigliata', 'Recommended shortlist'), M, y);
  y += 6;
  const rows = (data.modelRecommendations || []).slice(0, 5);
  rows.forEach((m, i) => {
    const h = 30;
    rounded(doc, M, y, CONTENT_W, h, i === 0 ? C.indigoSoft : C.white, 3.5, C.faint);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.2); setText(doc, C.indigo);
    doc.text(`#${i + 1}`, M + 5, y + 8);
    doc.setFontSize(10.8); setText(doc, C.ink);
    doc.text(txt(m.name), M + 16, y + 9);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.2); setText(doc, C.muted);
    doc.text(`${txt(m.vendor)} | fit ${Math.round(m.score || 0)}/100`, M + 16, y + 16);
    scoreBar(doc, M + 94, y + 8, 77, 'Coding', m.coding || 0, C.indigo);
    scoreBar(doc, M + 94, y + 16, 77, 'General', m.general || 0, C.green);
    scoreBar(doc, M + 94, y + 24, 77, 'Thinking', m.thinking || 0, C.amber);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.9); setText(doc, C.muted);
    doc.text(doc.splitTextToSize(txt((m.rationale || []).slice(1).join(' | ')), 70).slice(0, 2), M + 16, y + 23);
    y += h + 4;
  });

  y += 3;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); setText(doc, C.ink);
  doc.text(t('Portafoglio di routing', 'Routing portfolio'), M, y);
  y += 6;
  const portfolio = data.businessDecision?.portfolio || [];
  portfolio.forEach((p: any, i: number) => {
    const x = M + i * 61;
    rounded(doc, x, y, 57, 35, C.white, 3.5, C.faint);
    pill(doc, `${p.trafficPct || 0}%`, x + 5, y + 5, i === 0 ? C.indigoSoft : i === 1 ? C.greenSoft : C.amberSoft, i === 0 ? [61, 91, 190] : i === 1 ? [31, 139, 105] : [159, 107, 22], 19);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); setText(doc, C.ink);
    doc.text(txt(p.name), x + 5, y + 20, { maxWidth: 47 });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); setText(doc, C.muted);
    doc.text(doc.splitTextToSize(txt(p.reason), 47).slice(0, 2), x + 5, y + 27);
  });
}

function drawHardware(doc: jsPDF, data: PremiumPdfData) {
  const t = (a: string, b: string) => data.it ? a : b;
  doc.addPage();
  pageHeader(doc, t('Hardware architecture', 'Hardware architecture'));
  let y = sectionTitle(doc, '03 / HARDWARE', t('Minimo, consigliato, top', 'Minimum, recommended, top'), t('Tre livelli di investimento confrontati su capacita, resilienza, energia e CAPEX.', 'Three investment tiers compared on capacity, resilience, power and CAPEX.'), 31);
  y += 5;

  const cards = data.recommendations || [];
  const gap = 5;
  const w = (CONTENT_W - gap * 2) / 3;
  cards.slice(0, 3).forEach((r, i) => {
    const a = r.assessment;
    const x = M + i * (w + gap);
    const highlight = r.kind === 'recommended';
    rounded(doc, x, y, w, 103, highlight ? C.indigoSoft : C.white, 4, highlight ? [169, 185, 245] : C.faint);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(6.8); setText(doc, C.indigo);
    doc.text(txt(r.title).toUpperCase(), x + 5, y + 9);
    const fc = fitColors(a?.status || 'recommended');
    pill(doc, labelFit(a?.status || 'recommended', data.it), x + 5, y + 14, fc.fill, fc.text);
    doc.setFontSize(11); setText(doc, C.ink);
    doc.text(doc.splitTextToSize(txt(a?.serverName || '-'), w - 10).slice(0, 2), x + 5, y + 31);
    doc.setFontSize(16);
    doc.text(money(a?.estimatedCapexEur || 0, true), x + 5, y + 48);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); setText(doc, C.muted);
    doc.text('CAPEX INFERENCE', x + 5, y + 53);
    const metrics = [
      [t('Nodi', 'Nodes'), a?.requiredNodes],
      ['GPU', a?.requiredGpuCount],
      [t('Capacita', 'Capacity'), `~${a?.estimatedConcurrentCapacity || 0}`],
      ['N-1', a?.n1Pass ? 'PASS' : 'FAIL'],
      ['VRAM', `${Math.round(a?.memoryUtilizationPct || 0)}%`],
      ['AVG kW', num(a?.averageKw || 0, 1)]
    ];
    metrics.forEach((m, mi) => {
      const col = mi % 2; const row = Math.floor(mi / 2);
      const mx = x + 5 + col * (w - 12) / 2;
      const my = y + 63 + row * 11;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(5.8); setText(doc, C.muted); doc.text(txt(m[0]), mx, my);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.2); setText(doc, C.ink); doc.text(txt(m[1]), mx, my + 5);
    });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.2); setText(doc, C.muted);
    const reason = a?.reasons?.[0] || r.subtitle || '';
    doc.text(doc.splitTextToSize(txt(reason), w - 10).slice(0, 2), x + 5, y + 96);
  });
  y += 112;

  rounded(doc, M, y, CONTENT_W, 48, C.white, 4, C.faint);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); setText(doc, C.ink);
  doc.text(t('Resilienza e capacita', 'Resilience and capacity'), M + 7, y + 11);
  const a = data.selectedAssessment || {};
  const capMax = Math.max(a.estimatedConcurrentCapacity || 0, data.input?.concurrentUsers || 0, 1);
  bar(doc, M + 7, y + 23, 78, t('Capacita nominale', 'Nominal capacity'), a.estimatedConcurrentCapacity || 0, capMax, C.indigo);
  bar(doc, M + 7, y + 34, 78, 'N-1 capacity', a.n1ConcurrentCapacity || 0, capMax, a.n1Pass ? C.green : C.red);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); setText(doc, C.ink);
  doc.text(t('Energia', 'Power'), M + 103, y + 11);
  doc.setFontSize(16); doc.text(`${num(a.averageKw || 0, 1)} kW`, M + 103, y + 25);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); setText(doc, C.muted);
  doc.text(`${num(a.peakKw || 0, 1)} kW peak | PUE ${num(data.input?.pue || 0, 2)} | EUR ${num(data.input?.electricityEurPerKwh || 0, 2)}/kWh`, M + 103, y + 34);

  y += 57;
  rounded(doc, M, y, CONTENT_W, 48, C.white, 4, C.faint);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); setText(doc, C.ink);
  doc.text(t('Control plane LLMProxy', 'LLMProxy control plane'), M + 7, y + 11);
  const cps = [
    [t('Server proxy', 'Proxy servers'), `${data.onPrem?.proxyServers || 0}`],
    [t('Audit storage', 'Audit storage'), `~${data.onPrem?.controlPlaneStorageTb || 0} TB`],
    [t('Retention', 'Retention'), `${data.input?.auditRetentionDays || 0} d`],
    [t('Request/utente/giorno', 'Requests/user/day'), `${data.input?.requestsPerUserPerDay || 0}`]
  ];
  cps.forEach((s, i) => {
    const x = M + 7 + i * 43;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.3); setText(doc, C.muted); doc.text(txt(s[0]).toUpperCase(), x, y + 24);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10.8); setText(doc, C.ink); doc.text(txt(s[1]), x, y + 33);
  });
}

function drawEconomics(doc: jsPDF, data: PremiumPdfData) {
  const t = (a: string, b: string) => data.it ? a : b;
  doc.addPage();
  pageHeader(doc, t('Economics', 'Economics'));
  let y = sectionTitle(doc, '04 / ECONOMICS', t('Business case e TCO', 'Business case and TCO'), t('CAPEX, OPEX, energia e confronto tra modelli di deployment.', 'CAPEX, OPEX, power and deployment economics.'), 31);
  y += 5;
  const scenarioData = [
    { label: 'ON-PREM', scenario: data.onPrem, value: data.onPrem?.fourYearTcoEur || 0, accent: C.indigo },
    { label: 'COLOCATION', scenario: data.colo, value: data.colo?.fourYearTcoEur || 0, accent: C.slate },
    { label: 'CLOUD', scenario: data.rental, value: data.rental?.fourYearTcoEur || 0, accent: C.amber },
    { label: 'HYBRID', scenario: null, value: data.businessDecision?.hybridFourYearEur || 0, accent: C.green }
  ];
  const sw = (CONTENT_W - 12) / 4;
  scenarioData.forEach((s, i) => {
    const x = M + i * (sw + 4);
    const winner = txt(data.businessDecision?.recommendedLabel || '').toLowerCase().includes(s.label.toLowerCase().replace('on-prem', 'on')) || (s.label === 'HYBRID' && data.businessDecision?.recommendedMode === 'hybrid');
    rounded(doc, x, y, sw, 54, winner ? C.greenSoft : C.white, 4, winner ? [169, 226, 207] : C.faint);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); setText(doc, s.accent); doc.text(s.label, x + 5, y + 9);
    doc.setFontSize(15); setText(doc, C.ink); doc.text(money(s.value, true), x + 5, y + 22);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.2); setText(doc, C.muted); doc.text('TCO 4Y', x + 5, y + 28);
    const monthly = s.scenario?.monthlyEur || data.businessDecision?.hybridMonthlyEur || 0;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); setText(doc, C.ink); doc.text(`${money(monthly, true)}/mo`, x + 5, y + 39);
    if (winner) pill(doc, t('SCELTA', 'PICK'), x + 5, y + 44, C.green, C.white, 21);
  });
  y += 64;

  rounded(doc, M, y, 91, 89, C.white, 4, C.faint);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); setText(doc, C.ink); doc.text(t('Costo on-prem', 'On-prem cost stack'), M + 7, y + 11);
  const annual = Math.max(data.onPrem?.annualEur || 1, 1);
  const costRows = [
    [t('Energia', 'Power'), data.onPrem?.annualElectricityEur || 0, C.indigo],
    [t('Raffrescamento', 'Cooling'), data.onPrem?.annualCoolingEur || 0, C.green],
    [t('Manutenzione', 'Maintenance'), data.onPrem?.annualMaintenanceEur || 0, C.amber],
    [t('Hardware annualizzato', 'Annualized hardware'), data.onPrem?.annualizedHardwareEur || 0, C.slate]
  ];
  const costMax = Math.max(...costRows.map(r => Number(r[1])), 1);
  costRows.forEach((r, i) => bar(doc, M + 7, y + 25 + i * 13, 77, txt(r[0]), Math.round(Number(r[1]) / 1000), Math.round(costMax / 1000), r[2] as RGB, 'k'));
  doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); setText(doc, C.muted);
  doc.text(`${t('Totale operativo annuo', 'Annual operating total')}: ${money(annual)}`, M + 7, y + 81);

  rounded(doc, M + 97, y, CONTENT_W - 97, 89, C.white, 4, C.faint);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); setText(doc, C.ink); doc.text(t('Assunzioni economiche', 'Economic assumptions'), M + 104, y + 11);
  const assumptions = [
    [t('Energia', 'Electricity'), `EUR ${num(data.input?.electricityEurPerKwh || 0, 2)}/kWh`],
    ['PUE', num(data.input?.pue || 0, 2)],
    [t('GPU utilization', 'GPU utilization'), `${num(data.input?.gpuUtilizationPct || 0)}%`],
    [t('Cloud billable uptime', 'Cloud billable uptime'), `${num(data.input?.cloudAllocatedUptimePct || 0)}%`],
    [t('Maintenance', 'Maintenance'), `${num(data.input?.maintenancePercent || 0)}%/y`],
    [t('Ammortamento', 'Amortization'), `${num(data.input?.hardwareAmortizationYears || 0)} y`],
    [t('Fit-out', 'Fit-out'), money(data.input?.onPremFitoutEur || 0)],
    [t('Crescita', 'Growth'), `${num(data.input?.annualGrowthPct || 0)}%/y`]
  ];
  assumptions.forEach((a, i) => {
    const col = i % 2; const row = Math.floor(i / 2);
    const x = M + 104 + col * 39;
    const yy = y + 23 + row * 15;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.1); setText(doc, C.muted); doc.text(txt(a[0]).toUpperCase(), x, yy);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.6); setText(doc, C.ink); doc.text(txt(a[1]), x, yy + 5);
  });

  y += 99;
  rounded(doc, M, y, CONTENT_W, 42, C.navy2, 4);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7); setText(doc, [130, 153, 218]); doc.text(t('BUSINESS CASE', 'BUSINESS CASE'), M + 7, y + 10);
  doc.setFontSize(15); setText(doc, C.white);
  const saving = data.businessDecision?.savingsFourYearEur || 0;
  doc.text(saving >= 0 ? `${money(saving, true)} ${t('di risparmio potenziale', 'potential saving')}` : `${money(Math.abs(saving), true)} ${t('di extra costo', 'additional cost')}`, M + 7, y + 23);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); setText(doc, [165, 180, 207]);
  doc.text(`${t('Spend AI attuale', 'Current AI spend')}: ${money(data.input?.currentAnnualAiSpendEur || 0)}/y | ${t('Orizzonte', 'Horizon')}: ${data.input?.planningHorizonYears || 0}y`, M + 7, y + 33);
}

function drawMarket(doc: jsPDF, data: PremiumPdfData) {
  const t = (a: string, b: string) => data.it ? a : b;
  doc.addPage();
  pageHeader(doc, t('Providers and procurement', 'Providers and procurement'));
  let y = sectionTitle(doc, '05 / MARKET', t('Cloud e acquisto', 'Cloud and purchase'), t('Alternative di mercato per la configurazione selezionata, ordinate per costo.', 'Market alternatives for the selected configuration, sorted by cost.'), 31);
  y += 5;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); setText(doc, C.ink); doc.text(t('Cloud shortlist', 'Cloud shortlist'), M, y);
  y += 6;
  const cloud = (data.cloudOffers || []).slice().sort((a, b) => (a.monthlyTotalEur || 0) - (b.monthlyTotalEur || 0)).slice(0, 6);
  cloud.forEach((o, i) => {
    const h = 26;
    rounded(doc, M, y, CONTENT_W, h, i === 0 ? C.greenSoft : C.white, 3.2, i === 0 ? [171, 227, 207] : C.faint);
    pill(doc, `#${i + 1}`, M + 4, y + 5, i === 0 ? C.green : C.indigoSoft, i === 0 ? C.white : [61, 91, 190], 14);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.2); setText(doc, C.ink); doc.text(txt(o.provider || '-'), M + 22, y + 9);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.8); setText(doc, C.muted); doc.text(doc.splitTextToSize(`${txt(o.product || '')} | ${txt(o.pricingClass || '')}`, 75).slice(0, 1), M + 22, y + 16);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5); setText(doc, C.ink); doc.text(`${money(o.monthlyTotalEur || 0)}/mo`, M + 121, y + 10);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.4); setText(doc, C.muted); doc.text(`${txt(o.compatibility || '')} | fit ${o.fitScore || 0}/100 | ${(o.regions || []).join(', ')}`, M + 121, y + 17, { maxWidth: 49 });
    if (o.sourceUrl) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(6.7); setText(doc, C.indigo);
      (doc as any).textWithLink(t('listino', 'pricing'), PAGE_W - M - 5, y + 10, { url: o.sourceUrl, align: 'right' });
    }
    y += h + 3;
  });

  y += 4;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); setText(doc, C.ink); doc.text(t('Acquisto server', 'Server purchase'), M, y);
  y += 6;
  const purchase = (data.purchaseOffers || []).slice().sort((a, b) => (a.totalPurchaseEur || 0) - (b.totalPurchaseEur || 0)).slice(0, 5);
  if (!purchase.length) {
    rounded(doc, M, y, CONTENT_W, 26, C.amberSoft, 3.2, [236, 211, 164]);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); setText(doc, [145, 97, 18]);
    doc.text(t('Nessun listino pubblico esatto: richiedere RFQ al vendor/OEM.', 'No exact public price list: request an RFQ from the vendor/OEM.'), M + 7, y + 15);
  } else {
    purchase.forEach((o, i) => {
      const h = 25;
      rounded(doc, M, y, CONTENT_W, h, i === 0 ? C.indigoSoft : C.white, 3.2, C.faint);
      pill(doc, `#${i + 1}`, M + 4, y + 5, C.indigoSoft, [61, 91, 190], 14);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9.2); setText(doc, C.ink); doc.text(txt(o.supplier || '-'), M + 22, y + 9);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(6.8); setText(doc, C.muted); doc.text(doc.splitTextToSize(txt(o.product || ''), 83).slice(0, 1), M + 22, y + 16);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5); setText(doc, C.ink); doc.text(money(o.totalPurchaseEur || 0), M + 121, y + 10);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(6.4); setText(doc, C.muted); doc.text(`${o.requiredNodes || 0} nodes | fit ${o.fitScore || 0}/100 | ${txt(o.leadTime || '')}`, M + 121, y + 17);
      if (o.sourceUrl) {
        doc.setFont('helvetica', 'bold'); doc.setFontSize(6.7); setText(doc, C.indigo);
        (doc as any).textWithLink(t('fonte', 'source'), PAGE_W - M - 5, y + 10, { url: o.sourceUrl, align: 'right' });
      }
      y += h + 3;
    });
  }
}

function drawAppendix(doc: jsPDF, data: PremiumPdfData) {
  const t = (a: string, b: string) => data.it ? a : b;
  doc.addPage();
  pageHeader(doc, t('Risks and assumptions', 'Risks and assumptions'));
  let y = sectionTitle(doc, '06 / APPENDIX', t('Rischi, limiti e prossimi passi', 'Risks, limits and next steps'), t('Le stime diventano procurement-grade solo dopo benchmark reali, security review e RFQ.', 'Planning becomes procurement-grade only after real benchmarks, security review and RFQ.'), 31);
  y += 5;

  rounded(doc, M, y, 91, 101, C.white, 4, C.faint);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); setText(doc, C.ink); doc.text(t('Rischi principali', 'Key risks'), M + 7, y + 11);
  let yy = y + 23;
  const risks = [...(data.businessDecision?.risks || []), ...(data.onPrem?.warnings || [])].slice(0, 6);
  risks.forEach((r, i) => {
    const c = i < 3 ? C.amber : C.red;
    setFill(doc, c); doc.circle(M + 9, yy - 1.3, 1.3, 'F');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.4); setText(doc, C.ink);
    const lines = doc.splitTextToSize(txt(r), 70).slice(0, 3);
    doc.text(lines, M + 13, yy);
    yy += lines.length * 3.7 + 3;
  });

  rounded(doc, M + 97, y, CONTENT_W - 97, 101, C.white, 4, C.faint);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); setText(doc, C.ink); doc.text(t('Input chiave', 'Key inputs'), M + 104, y + 11);
  const inputs = [
    [t('Profilo', 'Profile'), data.input?.businessProfile],
    [t('Dati', 'Data'), data.input?.dataSensitivity],
    [t('Regione', 'Region'), data.input?.regionPreference],
    [t('Disponibilita', 'Availability'), data.input?.availabilityMode],
    [t('Utenti', 'Users'), data.input?.averageUsers],
    [t('Contemporanei', 'Concurrent'), data.input?.concurrentUsers],
    [t('Context medio', 'Average context'), data.input?.averageContextTokens],
    [t('Context max', 'Max context'), data.input?.maxContextTokens],
    [t('Output medio', 'Average output'), data.input?.averageOutputTokens],
    [t('Retention audit', 'Audit retention'), `${data.input?.auditRetentionDays} d`]
  ];
  inputs.forEach((r, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = M + 104 + col * 40;
    const iy = y + 23 + row * 14;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(5.8); setText(doc, C.muted); doc.text(txt(r[0]).toUpperCase(), x, iy);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); setText(doc, C.ink); doc.text(txt(r[1]), x, iy + 5, { maxWidth: 35 });
  });
  y += 111;

  rounded(doc, M, y, CONTENT_W, 55, C.navy2, 4);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7); setText(doc, [130, 153, 218]); doc.text(t('PRIMA DEL PROCUREMENT', 'BEFORE PROCUREMENT'), M + 7, y + 10);
  doc.setFontSize(14); setText(doc, C.white); doc.text(t('Validazione consigliata', 'Recommended validation'), M + 7, y + 22);
  const steps = data.it
    ? ['1. Benchmark model x precision x runtime x GPU x context.', '2. Test di carico su TTFT, tok/s e concorrenza stabile.', '3. Security/compliance review e data residency.', '4. RFQ con almeno 3 provider/OEM e verifica SLA/supporto.']
    : ['1. Benchmark model x precision x runtime x GPU x context.', '2. Load-test TTFT, tok/s and stable concurrency.', '3. Security/compliance review and data residency.', '4. RFQ with at least 3 providers/OEMs and SLA/support validation.'];
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.8); setText(doc, [184, 197, 220]);
  steps.forEach((s, i) => doc.text(txt(s), M + 7, y + 33 + i * 5.2));

  y += 65;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); setText(doc, C.ink); doc.text(t('Nota metodologica', 'Methodology note'), M, y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.2); setText(doc, C.muted);
  const note = data.it
    ? 'I punteggi capability 0-100 sono indici normalizzati di planning e non percentuali di accuratezza. Capacita, costi e consumo sono stime di pianificazione; prezzi pubblici possono escludere IVA, egress, storage, supporto, installazione e sconti negoziati.'
    : 'Capability scores 0-100 are normalized planning indexes, not accuracy percentages. Capacity, cost and power are planning estimates; public prices may exclude tax, egress, storage, support, installation and negotiated discounts.';
  doc.text(doc.splitTextToSize(note, CONTENT_W), M, y + 7);
}

export function exportPremiumPdf(data: PremiumPdfData) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  doc.setProperties({
    title: 'AI Strategy Report',
    subject: 'AI infrastructure and strategy decision report',
    author: 'AI Strategy Calculator',
    creator: 'AI Strategy Calculator'
  });

  drawCover(doc, data);
  drawExecutive(doc, data);
  drawModels(doc, data);
  drawHardware(doc, data);
  drawEconomics(doc, data);
  drawMarket(doc, data);
  drawAppendix(doc, data);
  addFooter(doc, data);

  const modelSlug = txt(data.selectedModel?.name || 'scenario').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);
  const date = data.generatedAt.toISOString().slice(0, 10);
  doc.save(`ai-strategy-report-${modelSlug || 'scenario'}-${date}.pdf`);
}
