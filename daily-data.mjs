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
  notes: [],
};
