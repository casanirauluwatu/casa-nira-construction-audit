// Laporan Harian — on-site labour snapshot per villa.
//
// Source: "Daily Mapping Labour on Site" (tab per month; row 3 = dates, each day
// spans [Rencana, Aktual, Status]; the unit header row carries the unit total).
// This is a point-in-time snapshot committed to the repo. Set DAILY_FEED to an
// Apps Script /exec URL returning the same shape to make it live instead.
//
// Deliberately NOT stored here: progress percentages, targets and deviation.
// Those come from the construction "Time Schedule" feeds via audit-core.mjs and
// are shown in the Construction Audit tab — keeping one source per figure means
// the two tabs can never disagree.
//
//   plan    = planned head-count for the day
//   workers = actual head-count on site
//   comp    = trade breakdown of who was on site
//   folder  = Google Drive folder id for that unit's daily photos

export const DAILY = {
  project: "Casa Nira Uluwatu",
  date: "2026-07-30",
  labourSource: "Daily Mapping Labour on Site",
  photosFolder: "1x_VL0b99xelLk5ON9jaRR5tbo8S1lhfl",
  units: [
    { id: "A1", block: "A", type: "The Haven",     batch: "Batch 1", plan: 21, workers: 4,  comp: "ARS Sipil 2 · MEP Elektrikal 2",                                folder: "1PtANvXDf3awXIguSYKcyP7IQqb2-yktE" },
    { id: "A2", block: "A", type: "The Haven",     batch: "Batch 1", plan: 21, workers: 3,  comp: "ARS Sipil 2 · ARS Cat 1",                                       folder: "1zNjrvdq-lTQpD0MZtM48PsCMaYhNGCC9" },
    { id: "A3", block: "A", type: "The Haven+",    batch: "Batch 5", plan: 6,  workers: 6,  comp: "STR 6",                                                         folder: "1oyjbeTHbhEgavP-xJ3yiS9h9vm3UJgF8" },
    { id: "A4", block: "A", type: "The Haven",     batch: "Batch 4", plan: 21, workers: 4,  comp: "ARS Sipil 4",                                                   folder: "1zbK93MOnwEtU40xJ1NrDKuo_BzGRejPR" },
    { id: "A5", block: "A", type: "The Haven+",    batch: "Batch 5", plan: 6,  workers: 2,  comp: "STR 2",                                                         folder: "16gEYO6KSsOyHXO_BbValHaCOXZb4kXRu" },
    { id: "B1", block: "B", type: "The Essence",   batch: "Batch 1", plan: 21, workers: 10, comp: "ARS Sipil 2 · ARS Terazzo 6 · Landscape 2",                     folder: "1g95qgmiwDqyTc2aOQ_-xsG0AYnhglnPN" },
    { id: "B2", block: "B", type: "The Essence",   batch: "Batch 4", plan: 18, workers: 10, comp: "ARS Sipil 6 · MEP Elektrikal 2 · MEP Plumbing 2",               folder: "1SSLpP1oTv2eYYM91uu_YfTlfRp9ZCY8B" },
    { id: "B3", block: "B", type: "The Essence",   batch: "Batch 1", plan: 12, workers: 1,  comp: "ARS Sipil 1",                                                   folder: "1CoNR0PYuquCmPKYoxupSh2ZuksgOSxPv" },
    { id: "B4", block: "B", type: "The Essence",   batch: "Batch 2", plan: 14, workers: 11, comp: "ARS Sipil 4 · ARS Plafond 3 · MEP Elektrikal 2 · MEP Plumbing 2", folder: "1yp_vJp4nfXDOj5LIaj_ZiCZg-8ssGmzz" },
    { id: "B5", block: "B", type: "The Essence",   batch: "Batch 4", plan: 6,  workers: 2,  comp: "STR 2",                                                         folder: "11NdER6zzmzwzkWad9o-Pay_EeZ0KcjBp" },
    { id: "C1", block: "C", type: "The Sanctuary", batch: "Batch 1", plan: 21, workers: 2,  comp: "ARS Sipil 2",                                                   folder: "1CK_yj6jjfXSKFDtofl16sNVADc0JBQHy" },
    { id: "C2", block: "C", type: "The Sanctuary", batch: "Batch 2", plan: 17, workers: 8,  comp: "ARS Sipil 4 · MEP Elektrikal 2 · MEP Plumbing 2",               folder: "1Sh0vvdq_ZVZYlGNiv9iQrWSJlMTYtTmJ" },
    { id: "C3", block: "C", type: "The Sanctuary", batch: "Batch 2", plan: 21, workers: 13, comp: "ARS Sipil 6 · ARS Batu alam 3 · ARS Kolam 2 · MEP Plumbing 2",  folder: "1txA8r6y7qW_KDNUBRRLj0i6YuRb3sysW" },
    { id: "C4", block: "C", type: "The Sanctuary", batch: "Batch 2", plan: 17, workers: 6,  comp: "ARS Sipil 6",                                                   folder: "1opabxxiVFQcD1GGG3QTM-mTv3v5eIsTe" },
    { id: "C5", block: "C", type: "The Sanctuary", batch: "Batch 2", plan: 17, workers: 9,  comp: "ARS Sipil 7 · MEP Plumbing 2",                                  folder: "1aGuBxMYGcaOniNuvw0WhkYg0RPYxqPZe" },
    { id: "C6", block: "C", type: "The Sanctuary", batch: "Batch 4", plan: 17, workers: 4,  comp: "ARS Sipil 4",                                                   folder: "1XzxqL4bmXJVhx9qKr-cpcxh0CxJs085O" },
    { id: "C7", block: "C", type: "The Sanctuary", batch: "Batch 3", plan: 20, workers: 9,  comp: "ARS Sipil 7 · MEP Elektrikal 2",                                folder: "1NwQdLypwhYzs9dz676r9cO2eZQWE0yhF" },
    { id: "C8", block: "C", type: "The Sanctuary", batch: "Batch 4", plan: 17, workers: 0,  comp: "",                                                              folder: "1DUXfpizbIDnKzXJl54UF4SKtkJd_q6Ui" },
    { id: "D1", block: "D", type: "The Eden",      batch: "Batch 3", plan: 17, workers: 8,  comp: "ARS Sipil 4 · MEP Elektrikal 2 · MEP Plumbing 2",               folder: "1SnKcbBJpvZIEUFEWc1KvnC3jpTsxc67b" },
  ],
  // Non-villa blocks from the same sheet. Kept out of `units` so the 19-villa
  // figures and per-block rollups stay clean, but surfaced so the report totals
  // reconcile with the spreadsheet's own "Total" row (325 plan / 123 actual).
  other: [
    { id: "Utilities",     plan: 7, workers: 6, comp: "STR 6" },
    { id: "Infrastruktur", plan: 0, workers: 0, comp: "" },
    { id: "Fabrikasi",     plan: 8, workers: 5, comp: "Pak Karno : Begisting 1 · Pak Pri : Begisting 2 · Pak Pri : Besi 2" },
  ],
  // Day-by-day head-count for the snapshot's month, read from the same sheet
  // (Juli 2026). Lets the manpower chart work without DAILY_FEED.
  series: {
    month: "Juli 2026",
    dates: ["2026-07-01","2026-07-02","2026-07-03","2026-07-04","2026-07-05","2026-07-06","2026-07-07","2026-07-08","2026-07-09","2026-07-10","2026-07-11","2026-07-12","2026-07-13","2026-07-14","2026-07-15","2026-07-16","2026-07-17","2026-07-18","2026-07-19","2026-07-20","2026-07-21","2026-07-22","2026-07-23","2026-07-24","2026-07-25","2026-07-26","2026-07-27","2026-07-28","2026-07-29","2026-07-30","2026-07-31"],
    total: { plan: [195,195,195,195,195,195,195,195,195,195,195,195,195,195,195,195,195,195,195,195,195,195,195,195,195,195,195,195,195,310,310], workers: [0,67,0,65,63,63,79,63,78,0,69,59,62,0,59,61,0,56,61,50,58,51,57,0,49,50,0,54,45,112,0] },
    units: {
      A1: { plan: [12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,21,21], workers: [0,5,0,4,1,3,4,0,2,0,0,0,0,0,0,0,0,1,0,0,0,2,2,0,2,2,0,4,5,4,0] },
      A2: { plan: [11,11,11,11,11,11,11,11,11,11,11,11,11,11,11,11,11,11,11,11,11,11,11,11,11,11,11,11,11,21,21], workers: [0,6,0,8,9,0,5,0,1,0,0,0,3,0,0,8,0,8,0,0,0,0,0,0,0,4,0,0,0,3,0] },
      A3: { plan: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,6,6], workers: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,0,0,0,0,0,0,0,0,0,6,0] },
      A4: { plan: [12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,21,21], workers: [0,2,0,0,0,3,2,0,1,0,2,3,2,0,0,3,0,2,2,0,2,0,3,0,0,2,0,2,1,4,0] },
      A5: { plan: [6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6], workers: [0,2,0,4,4,2,4,4,5,0,2,2,2,0,4,6,0,3,2,0,2,0,0,0,0,0,0,2,2,2,0] },
      B1: { plan: [12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,21,21], workers: [0,2,0,6,8,1,10,7,0,0,2,2,5,0,1,4,0,1,7,3,2,2,2,0,1,0,0,1,1,10,0] },
      B2: { plan: [11,11,11,11,11,11,11,11,11,11,11,11,11,11,11,11,11,11,11,11,11,11,11,11,11,11,11,11,11,18,18], workers: [0,4,0,3,3,3,8,8,9,0,8,4,7,0,7,4,0,0,6,0,0,5,5,0,4,4,0,4,4,10,0] },
      B3: { plan: [12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12], workers: [0,5,0,8,5,5,3,0,4,0,0,0,2,0,2,0,0,4,3,0,0,0,0,0,2,6,0,7,4,1,0] },
      B4: { plan: [12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,14,14], workers: [0,4,0,2,2,4,7,2,4,0,0,0,2,0,4,0,0,0,0,0,0,0,0,0,0,0,0,0,0,11,0] },
      B5: { plan: [6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6], workers: [0,2,0,3,4,1,3,4,6,0,5,5,5,0,4,2,0,2,2,2,0,0,0,0,3,0,0,6,2,2,0] },
      C1: { plan: [13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,13,21,21], workers: [0,7,0,2,4,8,6,7,14,0,13,8,5,0,5,8,0,4,6,7,6,6,3,0,2,0,0,0,0,2,0] },
      C2: { plan: [12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,17,17], workers: [0,0,0,0,0,0,0,6,8,0,4,6,4,0,6,0,0,0,0,2,4,0,2,0,3,0,0,0,0,8,0] },
      C3: { plan: [12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,21,21], workers: [0,2,0,1,1,4,0,2,0,0,6,6,6,0,0,5,0,4,6,0,6,8,8,0,3,6,0,7,8,13,0] },
      C4: { plan: [12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,17,17], workers: [0,0,0,3,2,7,8,7,4,0,4,4,4,0,6,6,0,6,8,14,17,13,13,0,8,8,0,2,2,6,0] },
      C5: { plan: [12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,17,17], workers: [0,1,0,0,0,0,0,0,0,0,4,0,0,0,5,0,0,0,0,6,1,0,2,0,4,5,0,4,4,9,0] },
      C6: { plan: [10,10,10,10,10,10,10,10,10,10,10,10,10,10,10,10,10,10,10,10,10,10,10,10,10,10,10,10,10,17,17], workers: [0,13,0,9,7,9,4,6,6,0,8,7,5,0,5,7,0,11,8,8,11,7,8,0,8,1,0,5,0,4,0] },
      C7: { plan: [12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,20,20], workers: [0,10,0,8,7,2,5,8,8,0,7,8,8,0,8,8,0,6,4,0,7,7,7,0,5,6,0,6,6,9,0] },
      C8: { plan: [8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,17,17], workers: [0,0,0,2,4,5,6,2,2,0,2,2,0,0,0,0,0,0,2,3,0,1,2,0,2,4,0,4,4,0,0] },
      D1: { plan: [10,10,10,10,10,10,10,10,10,10,10,10,10,10,10,10,10,10,10,10,10,10,10,10,10,10,10,10,10,17,17], workers: [0,2,0,2,2,6,4,0,4,0,2,2,2,0,2,0,0,4,5,3,0,0,0,0,2,2,0,0,2,8,0] },
    },
  },
  months: ["April 2026", "Mei 2026", "Juli 2026", "Agustus 2026"],
  notes: [],
};
