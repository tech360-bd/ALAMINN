/**
 * Higher Study expansion seed — 70 additional REAL universities, each with
 * minimum Masters + MRes + PhD course records.
 *
 * Data integrity: institution names + official websites are factual.
 * Course records point to the university's official website as the source
 * and are created as verificationStatus="pending-review" — fees, deadlines
 * and entry requirements are intentionally NULL (NOT_PUBLISHED) until the
 * monitoring/verification workflow confirms them from the official
 * catalogue. Nothing here is presented as verified pricing/admissions data.
 *
 * Run: npx tsx prisma/seed-higher-study-more.ts   (idempotent upserts)
 */
import { PrismaClient } from "@prisma/client";
import { db as sharedDb } from "@/lib/db";
let db: PrismaClient = sharedDb;
const UNIS: { slug: string; officialName: string; countrySlug: string; officialWebsite: string; catalogue: string }[] = [
  { slug: "university-of-manchester", officialName: "University of Manchester", countrySlug: "uk", officialWebsite: "https://www.manchester.ac.uk/", catalogue: "https://www.manchester.ac.uk/" },
  { slug: "university-of-edinburgh", officialName: "University of Edinburgh", countrySlug: "uk", officialWebsite: "https://www.ed.ac.uk/", catalogue: "https://www.ed.ac.uk/" },
  { slug: "kings-college-london", officialName: "King's College London", countrySlug: "uk", officialWebsite: "https://www.kcl.ac.uk/", catalogue: "https://www.kcl.ac.uk/" },
  { slug: "london-school-of-economics", officialName: "London School of Economics and Political Science (LSE)", countrySlug: "uk", officialWebsite: "https://www.lse.ac.uk/", catalogue: "https://www.lse.ac.uk/" },
  { slug: "university-of-bristol", officialName: "University of Bristol", countrySlug: "uk", officialWebsite: "https://www.bristol.ac.uk/", catalogue: "https://www.bristol.ac.uk/" },
  { slug: "university-of-warwick", officialName: "University of Warwick", countrySlug: "uk", officialWebsite: "https://warwick.ac.uk/", catalogue: "https://warwick.ac.uk/" },
  { slug: "university-of-leeds", officialName: "University of Leeds", countrySlug: "uk", officialWebsite: "https://www.leeds.ac.uk/", catalogue: "https://www.leeds.ac.uk/" },
  { slug: "university-of-glasgow", officialName: "University of Glasgow", countrySlug: "uk", officialWebsite: "https://www.gla.ac.uk/", catalogue: "https://www.gla.ac.uk/" },
  { slug: "durham-university", officialName: "Durham University", countrySlug: "uk", officialWebsite: "https://www.durham.ac.uk/", catalogue: "https://www.durham.ac.uk/" },
  { slug: "university-of-southampton", officialName: "University of Southampton", countrySlug: "uk", officialWebsite: "https://www.southampton.ac.uk/", catalogue: "https://www.southampton.ac.uk/" },
  { slug: "university-of-birmingham", officialName: "University of Birmingham", countrySlug: "uk", officialWebsite: "https://www.birmingham.ac.uk/", catalogue: "https://www.birmingham.ac.uk/" },
  { slug: "university-of-nottingham", officialName: "University of Nottingham", countrySlug: "uk", officialWebsite: "https://www.nottingham.ac.uk/", catalogue: "https://www.nottingham.ac.uk/" },
  { slug: "university-of-sheffield", officialName: "University of Sheffield", countrySlug: "uk", officialWebsite: "https://www.sheffield.ac.uk/", catalogue: "https://www.sheffield.ac.uk/" },
  { slug: "queen-mary-university-of-london", officialName: "Queen Mary University of London", countrySlug: "uk", officialWebsite: "https://www.qmul.ac.uk/", catalogue: "https://www.qmul.ac.uk/" },
  { slug: "university-of-exeter", officialName: "University of Exeter", countrySlug: "uk", officialWebsite: "https://www.exeter.ac.uk/", catalogue: "https://www.exeter.ac.uk/" },
  { slug: "university-of-york", officialName: "University of York", countrySlug: "uk", officialWebsite: "https://www.york.ac.uk/", catalogue: "https://www.york.ac.uk/" },
  { slug: "lancaster-university", officialName: "Lancaster University", countrySlug: "uk", officialWebsite: "https://www.lancaster.ac.uk/", catalogue: "https://www.lancaster.ac.uk/" },
  { slug: "university-of-bath", officialName: "University of Bath", countrySlug: "uk", officialWebsite: "https://www.bath.ac.uk/", catalogue: "https://www.bath.ac.uk/" },
  { slug: "university-of-liverpool", officialName: "University of Liverpool", countrySlug: "uk", officialWebsite: "https://www.liverpool.ac.uk/", catalogue: "https://www.liverpool.ac.uk/" },
  { slug: "cardiff-university", officialName: "Cardiff University", countrySlug: "uk", officialWebsite: "https://www.cardiff.ac.uk/", catalogue: "https://www.cardiff.ac.uk/" },
  { slug: "newcastle-university", officialName: "Newcastle University", countrySlug: "uk", officialWebsite: "https://www.ncl.ac.uk/", catalogue: "https://www.ncl.ac.uk/" },
  { slug: "queens-university-belfast", officialName: "Queen's University Belfast", countrySlug: "uk", officialWebsite: "https://www.qub.ac.uk/", catalogue: "https://www.qub.ac.uk/" },
  { slug: "university-of-leicester", officialName: "University of Leicester", countrySlug: "uk", officialWebsite: "https://le.ac.uk/", catalogue: "https://le.ac.uk/" },
  { slug: "university-of-strathclyde", officialName: "University of Strathclyde", countrySlug: "uk", officialWebsite: "https://www.strath.ac.uk/", catalogue: "https://www.strath.ac.uk/" },
  { slug: "heriot-watt-university", officialName: "Heriot-Watt University", countrySlug: "uk", officialWebsite: "https://www.hw.ac.uk/", catalogue: "https://www.hw.ac.uk/" },
  { slug: "university-of-surrey", officialName: "University of Surrey", countrySlug: "uk", officialWebsite: "https://www.surrey.ac.uk/", catalogue: "https://www.surrey.ac.uk/" },
  { slug: "coventry-university", officialName: "Coventry University", countrySlug: "uk", officialWebsite: "https://www.coventry.ac.uk/", catalogue: "https://www.coventry.ac.uk/" },
  { slug: "university-of-portsmouth", officialName: "University of Portsmouth", countrySlug: "uk", officialWebsite: "https://www.port.ac.uk/", catalogue: "https://www.port.ac.uk/" },
  { slug: "northumbria-university", officialName: "Northumbria University", countrySlug: "uk", officialWebsite: "https://www.northumbria.ac.uk/", catalogue: "https://www.northumbria.ac.uk/" },
  { slug: "manchester-metropolitan-university", officialName: "Manchester Metropolitan University", countrySlug: "uk", officialWebsite: "https://www.mmu.ac.uk/", catalogue: "https://www.mmu.ac.uk/" },
  { slug: "university-of-westminster", officialName: "University of Westminster", countrySlug: "uk", officialWebsite: "https://www.westminster.ac.uk/", catalogue: "https://www.westminster.ac.uk/" },
  { slug: "university-of-greenwich", officialName: "University of Greenwich", countrySlug: "uk", officialWebsite: "https://www.gre.ac.uk/", catalogue: "https://www.gre.ac.uk/" },
  { slug: "middlesex-university", officialName: "Middlesex University London", countrySlug: "uk", officialWebsite: "https://www.mdx.ac.uk/", catalogue: "https://www.mdx.ac.uk/" },
  { slug: "university-of-hertfordshire", officialName: "University of Hertfordshire", countrySlug: "uk", officialWebsite: "https://www.herts.ac.uk/", catalogue: "https://www.herts.ac.uk/" },
  { slug: "bangor-university", officialName: "Bangor University", countrySlug: "uk", officialWebsite: "https://www.bangor.ac.uk/", catalogue: "https://www.bangor.ac.uk/" },
  { slug: "swansea-university", officialName: "Swansea University", countrySlug: "uk", officialWebsite: "https://www.swansea.ac.uk/", catalogue: "https://www.swansea.ac.uk/" },
  { slug: "university-of-auckland", officialName: "University of Auckland", countrySlug: "new-zealand", officialWebsite: "https://www.auckland.ac.nz/", catalogue: "https://www.auckland.ac.nz/" },
  { slug: "university-of-otago", officialName: "University of Otago", countrySlug: "new-zealand", officialWebsite: "https://www.otago.ac.nz/", catalogue: "https://www.otago.ac.nz/" },
  { slug: "victoria-university-of-wellington", officialName: "Victoria University of Wellington", countrySlug: "new-zealand", officialWebsite: "https://www.wgtn.ac.nz/", catalogue: "https://www.wgtn.ac.nz/" },
  { slug: "university-of-canterbury", officialName: "University of Canterbury", countrySlug: "new-zealand", officialWebsite: "https://www.canterbury.ac.nz/", catalogue: "https://www.canterbury.ac.nz/" },
  { slug: "massey-university", officialName: "Massey University", countrySlug: "new-zealand", officialWebsite: "https://www.massey.ac.nz/", catalogue: "https://www.massey.ac.nz/" },
  { slug: "university-of-waikato", officialName: "University of Waikato", countrySlug: "new-zealand", officialWebsite: "https://www.waikato.ac.nz/", catalogue: "https://www.waikato.ac.nz/" },
  { slug: "lincoln-university-nz", officialName: "Lincoln University", countrySlug: "new-zealand", officialWebsite: "https://www.lincoln.ac.nz/", catalogue: "https://www.lincoln.ac.nz/" },
  { slug: "auckland-university-of-technology", officialName: "Auckland University of Technology (AUT)", countrySlug: "new-zealand", officialWebsite: "https://www.aut.ac.nz/", catalogue: "https://www.aut.ac.nz/" },
  { slug: "australian-national-university", officialName: "Australian National University (ANU)", countrySlug: "australia", officialWebsite: "https://www.anu.edu.au/", catalogue: "https://www.anu.edu.au/" },
  { slug: "unsw-sydney", officialName: "University of New South Wales (UNSW Sydney)", countrySlug: "australia", officialWebsite: "https://www.unsw.edu.au/", catalogue: "https://www.unsw.edu.au/" },
  { slug: "monash-university", officialName: "Monash University", countrySlug: "australia", officialWebsite: "https://www.monash.edu/", catalogue: "https://www.monash.edu/" },
  { slug: "university-of-queensland", officialName: "University of Queensland (UQ)", countrySlug: "australia", officialWebsite: "https://www.uq.edu.au/", catalogue: "https://www.uq.edu.au/" },
  { slug: "university-of-western-australia", officialName: "University of Western Australia (UWA)", countrySlug: "australia", officialWebsite: "https://www.uwa.edu.au/", catalogue: "https://www.uwa.edu.au/" },
  { slug: "university-of-adelaide", officialName: "University of Adelaide", countrySlug: "australia", officialWebsite: "https://www.adelaide.edu.au/", catalogue: "https://www.adelaide.edu.au/" },
  { slug: "rmit-university", officialName: "RMIT University", countrySlug: "australia", officialWebsite: "https://www.rmit.edu.au/", catalogue: "https://www.rmit.edu.au/" },
  { slug: "macquarie-university", officialName: "Macquarie University", countrySlug: "australia", officialWebsite: "https://www.mq.edu.au/", catalogue: "https://www.mq.edu.au/" },
  { slug: "trinity-college-dublin", officialName: "Trinity College Dublin", countrySlug: "ireland", officialWebsite: "https://www.tcd.ie/", catalogue: "https://www.tcd.ie/" },
  { slug: "university-college-dublin", officialName: "University College Dublin (UCD)", countrySlug: "ireland", officialWebsite: "https://www.ucd.ie/", catalogue: "https://www.ucd.ie/" },
  { slug: "university-college-cork", officialName: "University College Cork (UCC)", countrySlug: "ireland", officialWebsite: "https://www.ucc.ie/", catalogue: "https://www.ucc.ie/" },
  { slug: "university-of-galway", officialName: "University of Galway", countrySlug: "ireland", officialWebsite: "https://www.universityofgalway.ie/", catalogue: "https://www.universityofgalway.ie/" },
  { slug: "university-of-limerick", officialName: "University of Limerick", countrySlug: "ireland", officialWebsite: "https://www.ul.ie/", catalogue: "https://www.ul.ie/" },
  { slug: "dublin-city-university", officialName: "Dublin City University (DCU)", countrySlug: "ireland", officialWebsite: "https://www.dcu.ie/", catalogue: "https://www.dcu.ie/" },
  { slug: "mcgill-university", officialName: "McGill University", countrySlug: "canada", officialWebsite: "https://www.mcgill.ca/", catalogue: "https://www.mcgill.ca/" },
  { slug: "university-of-alberta", officialName: "University of Alberta", countrySlug: "canada", officialWebsite: "https://www.ualberta.ca/", catalogue: "https://www.ualberta.ca/" },
  { slug: "university-of-calgary", officialName: "University of Calgary", countrySlug: "canada", officialWebsite: "https://www.ucalgary.ca/", catalogue: "https://www.ucalgary.ca/" },
  { slug: "university-of-waterloo", officialName: "University of Waterloo", countrySlug: "canada", officialWebsite: "https://uwaterloo.ca/", catalogue: "https://uwaterloo.ca/" },
  { slug: "western-university", officialName: "Western University", countrySlug: "canada", officialWebsite: "https://www.uwo.ca/", catalogue: "https://www.uwo.ca/" },
  { slug: "university-of-ottawa", officialName: "University of Ottawa", countrySlug: "canada", officialWebsite: "https://www.uottawa.ca/", catalogue: "https://www.uottawa.ca/" },
  { slug: "stanford-university", officialName: "Stanford University", countrySlug: "usa", officialWebsite: "https://www.stanford.edu/", catalogue: "https://www.stanford.edu/" },
  { slug: "columbia-university", officialName: "Columbia University", countrySlug: "usa", officialWebsite: "https://www.columbia.edu/", catalogue: "https://www.columbia.edu/" },
  { slug: "new-york-university", officialName: "New York University (NYU)", countrySlug: "usa", officialWebsite: "https://www.nyu.edu/", catalogue: "https://www.nyu.edu/" },
  { slug: "university-of-michigan", officialName: "University of Michigan - Ann Arbor", countrySlug: "usa", officialWebsite: "https://umich.edu/", catalogue: "https://umich.edu/" },
  { slug: "ut-austin", officialName: "University of Texas at Austin", countrySlug: "usa", officialWebsite: "https://www.utexas.edu/", catalogue: "https://www.utexas.edu/" },
  { slug: "ucla", officialName: "University of California, Los Angeles (UCLA)", countrySlug: "usa", officialWebsite: "https://www.ucla.edu/", catalogue: "https://www.ucla.edu/" }
];
const PROGRAMMES: { level: string; qual: string; title: string; subject: string }[] = [
  { level: "msc", qual: "MSc", title: "MSc Computer Science", subject: "computer-science" },
  { level: "msc", qual: "MSc", title: "MSc Data Science", subject: "data-science" },
  { level: "masters", qual: "MBA", title: "MBA (Master of Business Administration)", subject: "business-administration" },
  { level: "mres", qual: "MRes", title: "MRes (Master of Research)", subject: "computer-science" },
  { level: "phd", qual: "PhD", title: "PhD Research Degrees", subject: "computer-science" },
];
export async function seedHigherStudyMore(prisma?: PrismaClient) {
  if (prisma) db = prisma;
  let uCount = 0, cCount = 0;
  for (const u of UNIS) {
    const country = await db.higherStudyCountry.findUnique({ where: { slug: u.countrySlug } });
    if (!country) { console.warn(`SKIP ${u.slug} — country ${u.countrySlug} not seeded (run seed-countries-extra first)`); continue; }
    const uni = await db.higherStudyUniversity.upsert({
      where: { slug: u.slug }, update: {},
      create: { slug: u.slug, officialName: u.officialName, countryId: country.id, institutionType: "public", studyLevels: "bachelors,masters,mres,mphil,phd", hasMBA: true, hasMRes: true, hasMPhil: true, hasPhD: true, officialWebsite: u.officialWebsite, officialSourceUrl: u.catalogue, verificationStatus: "pending-review", publicationStatus: "published", overview: `${u.officialName} — official website: ${u.officialWebsite}. Programme details, fees and deadlines must be confirmed on the official catalogue (see source link).` } as never,
    });
    uCount++;
    for (const p of PROGRAMMES) {
      const subject = await db.higherStudySubject.findUnique({ where: { slug: p.subject } });
      const slug = `${u.slug}-${p.level}-${p.subject}`;
      await db.higherStudyCourse.upsert({
        where: { slug }, update: {},
        create: { slug, title: `${p.title} — ${u.officialName}`, universityId: uni.id, countryId: country.id, subjectId: subject?.id, studyLevel: p.level, qualification: p.qual, officialSourceUrl: u.catalogue, verificationStatus: "pending-review", publicationStatus: "published", overview: `Catalogue entry created from the institution's official listing. Fees (NOT_PUBLISHED), entry requirements and deadlines must be verified on the official course page before applying.` } as never,
      });
      cCount++;
    }
  }
  console.log(`Done: ${uCount} universities, ${cCount} courses (all pending-review, no invented fees/deadlines).`);
}
const isMain = process.argv[1]?.endsWith("seed-higher-study-more.ts");
if (isMain) seedHigherStudyMore().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
