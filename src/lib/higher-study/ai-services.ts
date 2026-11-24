/**
 * Higher Study AI Services catalogue.
 *
 * Pure, server-safe definitions and prompt construction. No provider call and
 * no credential access lives here, so this module can be unit-tested and
 * imported by the public UI without risk of secret exposure.
 */
import { z } from "zod";

export type ServiceLanguage = "en" | "bn";

export interface ServiceField {
  name: string;
  labelEn: string;
  labelBn: string;
  placeholderEn: string;
  placeholderBn: string;
  required: boolean;
  maxLength: number;
  multiline: boolean;
}

export interface AIServiceDefinition {
  id: string;
  titleEn: string;
  titleBn: string;
  descriptionEn: string;
  descriptionBn: string;
  category: "writing" | "research" | "applications" | "academic";
  /** Service-specific guardrail appended to the shared no-fabrication rules. */
  focusEn: string;
  focusBn: string;
  fields: ServiceField[];
}

function field(
  name: string,
  labelEn: string,
  labelBn: string,
  placeholderEn: string,
  placeholderBn: string,
  options: { required?: boolean; maxLength?: number; multiline?: boolean } = {}
): ServiceField {
  return {
    name,
    labelEn,
    labelBn,
    placeholderEn,
    placeholderBn,
    required: options.required ?? true,
    maxLength: options.maxLength ?? 4000,
    multiline: options.multiline ?? true,
  };
}

const BACKGROUND = field(
  "background",
  "Your background",
  "আপনার পটভূমি",
  "Degree, institution, field of study, grades and relevant experience.",
  "ডিগ্রি, প্রতিষ্ঠান, বিষয়, ফলাফল এবং প্রাসঙ্গিক অভিজ্ঞতা।"
);
const GOAL = field(
  "goal",
  "Goal / purpose",
  "লক্ষ্য / উদ্দেশ্য",
  "What are you applying for, and why does it matter to you?",
  "আপনি কীভাবে আবেদন করছেন এবং কেন এটি আপনার জন্য গুরুত্বপূর্ণ?"
);
const DETAILS = field(
  "details",
  "Additional details",
  "অতিরিক্ত তথ্য",
  "Programme, country, deadline, word limit, or any instructions you must follow.",
  "প্রোগ্রাম, দেশ, Deadline, শব্দসীমা বা অনুসরণীয় নির্দেশনা।",
  { required: false }
);

export const AI_SERVICES: readonly AIServiceDefinition[] = [
  {
    id: "cv-builder",
    titleEn: "CV / Resume Builder",
    titleBn: "সিভি / রিজুমে বিল্ডার",
    descriptionEn: "Structure verified education, experience, projects and skills into a professional CV.",
    descriptionBn: "যাচাইকৃত শিক্ষা, অভিজ্ঞতা, প্রকল্প ও দক্ষতা পেশাদার সিভিতে সাজান।",
    category: "applications",
    focusEn: "Use only facts the user supplied. Mark any missing section as a question for the user instead of inventing content.",
    focusBn: "শুধু ব্যবহারকারীর দেওয়া তথ্য ব্যবহার করুন। কোনো তথ্য না থাকলে উদ্ভাবন না করে প্রশ্ন করুন।",
    fields: [
      BACKGROUND,
      field("experience", "Work experience", "কর্ম অভিজ্ঞতা", "Roles, organisations, dates, measurable outcomes.", "পদবী, প্রতিষ্ঠান, সময়কাল ও পরিমাযোগ্য ফলাফল।"),
      field("projects", "Projects & publications", "প্রকল্প ও প্রকাশনা", "Titles, your contribution, links if public.", "শিরোনাম, আপনার অবদান, প্রকাশ্য লিংক।", { required: false }),
      DETAILS,
    ],
  },
  {
    id: "research-paper-assistant",
    titleEn: "Research Paper Assistant",
    titleBn: "গবেষণা পেপার সহকারী",
    descriptionEn: "Shape a research topic into a structured paper outline and draft sections.",
    descriptionBn: "গবেষণা বিষয়কে কাঠামোবদ্ধ পেপার আউটলাইন ও খসড়ায় রূপ দিন।",
    category: "research",
    focusEn: "Never fabricate authors, titles, DOIs, journal names, dates, quotations or URLs. If a citation is requested, state that it must be verified against an official source.",
    focusBn: "লেখক, শিরোনাম, DOI, জার্নাল, তারিখ, উদ্ধৃতি বা লিংক কখনো উদ্ভাবন করবেন না।",
    fields: [BACKGROUND, GOAL, DETAILS],
  },
  {
    id: "research-proposal-builder",
    titleEn: "Research Proposal Builder",
    titleBn: "গবেষণা প্রস্তাবনা বিল্ডার",
    descriptionEn: "Build problem statement, objectives, methodology, timeline and expected outcomes.",
    descriptionBn: "সমস্যা বিবৃতি, লক্ষ্য, পদ্ধতি, সময়সূচি ও প্রত্যাশিত ফলাফল তৈরি করুন।",
    category: "research",
    focusEn: "Keep methodology proportionate to the stated resources and flag ethical approval requirements without claiming approval was obtained.",
    focusBn: "পদ্ধতি বাস্তব তথ্যের সাথে সামঞ্জস্যপূর্ণ রাখুন এবং নৈতিক অনুমোদন সম্পর্কে সতর্ক করুন।",
    fields: [GOAL, BACKGROUND, DETAILS],
  },
  {
    id: "personal-statement-builder",
    titleEn: "Personal Statement Builder",
    titleBn: "পার্সনাল স্টেটমেন্ট বিল্ডার",
    descriptionEn: "Draft a truthful, personal statement grounded in the applicant's own experience.",
    descriptionBn: "আবেদনকারীর নিজস্ব অভিজ্ঞতাভিত্তিক সত্যিখাঁচি পার্সনাল স্টেটমেন্ট তৈরি করুন।",
    category: "writing",
    focusEn: "Do not invent achievements or guarantee admission. Use only supplied facts and clearly mark prompts for missing information.",
    focusBn: "কৃতিত্ব উদ্ভাবন বা ভর্তির গ্যারান্টি দেবেন না। শুধু প্রদত্ত তথ্য ব্যবহার করুন।",
    fields: [BACKGROUND, GOAL, DETAILS],
  },
  {
    id: "sop-builder",
    titleEn: "Statement of Purpose Builder",
    titleBn: "স্টেটমেন্ট অব পারপজ বিল্ডার",
    descriptionEn: "Programme-specific SOP with academic fit, motivation and career plan.",
    descriptionBn: "প্রোগ্রাম-নির্দিষ্ট SOP — শিক্ষাগত উপযোগিতা,-motivation ও ক্যারিয়ার পরিকল্পনা।",
    category: "writing",
    focusEn: "Do not promise admission or scholarship. Reference only programme details supplied by the user or clearly labelled as needing verification.",
    focusBn: "ভর্তি বা বৃত্তির প্রতিশ্রুতি দেবেন না। শুধু প্রদত্ত তথ্য ব্যবহার করুন।",
    fields: [GOAL, BACKGROUND, DETAILS],
  },
  {
    id: "motivation-letter-builder",
    titleEn: "Motivation Letter Builder",
    titleBn: "মোটিভেশন লেটার বিল্ডার",
    descriptionEn: "Concise, specific motivation letter for a university or scholarship.",
    descriptionBn: "বিশ্ববিদ্যালয় বা বৃত্তির জন্য সংক্ষিপ্ত ও নির্দিষ্ট মোটিভেশন লেটার।",
    category: "writing",
    focusEn: "Keep tone sincere; never claim feelings, achievements or facts the user did not provide.",
    focusBn: "সত্যিকার স্বর বজায় রাখুন; ব্যবহারকারীর দেওয়া তথ্যের বাইরে কিছু দাবি করবেন না।",
    fields: [GOAL, BACKGROUND, DETAILS],
  },
  {
    id: "scholarship-application-assistant",
    titleEn: "Scholarship Application Assistant",
    titleBn: "স্কলারশিপ আবেদন সহকারী",
    descriptionEn: "Organise eligibility evidence and draft a scholarship-specific application.",
    descriptionBn: "যোগ্যতার প্রমাণ সংগঠিত করুন এবং বৃত্তি-নির্দিষ্ট আবেদন খসড়া করুন।",
    category: "applications",
    focusEn: "Never promise a scholarship outcome; state that the official committee decides and that deadlines must be verified on the official site.",
    focusBn: "বৃত্তি ফলাফলের প্রতিশ্রুতি দেবেন না; অফিশিয়াল সাইটে Deadline যাচাই করতে বলুন।",
    fields: [GOAL, BACKGROUND, DETAILS],
  },
  {
    id: "university-application-assistant",
    titleEn: "University Application Assistant",
    titleBn: "বিশ্ববিদ্যালয় আবেদন সহকারী",
    descriptionEn: "Plan a complete, program-specific application package.",
    descriptionBn: "প্রোগ্রাম-নির্দিষ্ট সম্পূর্ণ আবেদন প্যাকেজের পরিকল্পনা করুন।",
    category: "applications",
    focusEn: "Requirements must be clearly separated into 'user supplied' and 'verify on the official university site'. Do not invent deadlines.",
    focusBn: "প্রয়োজনীয়তা 'ব্যবহারকারীর দেওয়া' ও 'অফিশিয়াল সাইটে যাচাই করুন' — এই দুই ভাগে রাখুন।",
    fields: [GOAL, BACKGROUND, DETAILS],
  },
  {
    id: "academic-writing-assistant",
    titleEn: "Academic Writing Assistant",
    titleBn: "একাডেমিক রাইটিং সহকারী",
    descriptionEn: "Improve clarity, structure and academic tone while preserving the author's meaning.",
    descriptionBn: "লেখকের অর্থ অক্ষত রেখে স্পষ্টতা, কাঠামো ও একাডেমিক স্বর উন্নত করুন।",
    category: "writing",
    focusEn: "Preserve the original claims. Do not add facts, data or citations that are absent from the supplied text.",
    focusBn: "মূল বক্তব্য অপরিবর্তিত রাখুন। নতুন তথ্য বা উদ্ধৃতি যোগ করবেন না।",
    fields: [field("text", "Text to improve", "উন্নত করার লেখা", "Paste the paragraph or section to review.", "পর্যালোচনার জন্য অনুচ্ছেদ বা অংশ পেস্ট করুন।"), DETAILS],
  },
  {
    id: "literature-review-assistant",
    titleEn: "Literature Review Assistant",
    titleBn: "সাহিত্য পর্যালোচনা সহকারী",
    descriptionEn: "Organise a literature review around themes, gaps and your research question.",
    descriptionBn: "থিম, গবেষণা ফাঁক ও প্রশ্নের চারপাশে সাহিত্য পর্যালোচনা সাজান।",
    category: "research",
    focusEn: "Never invent sources. If sources are not supplied, produce a structure with explicit placeholders and instruct the user to add verified references.",
    focusBn: "উৎস উদ্ভাবন করবেন না। উৎস না দিলে কাঠামো দিন এবং যাচাইকৃত রেফারেন্স যোগ করতে বলুন।",
    fields: [GOAL, field("sources", "Sources you have verified", "আপনি যাচাইকৃত উৎস", "Titles/authors/URLs you have personally verified.", "আপনি নিজে যাচাইকৃত শিরোনাম/লেখক/লিংক।", { required: false }), DETAILS],
  },
  {
    id: "study-plan-builder",
    titleEn: "Study Plan Builder",
    titleBn: "স্টাডি প্ল্যান বিল্ডার",
    descriptionEn: "A realistic semester-by-semester plan with milestones and workload.",
    descriptionBn: "অর্জনীয় মাইলস্টোন ও কাজের চাপসহ সেমিস্টার-ভিত্তিক পরিকল্পনা।",
    category: "applications",
    focusEn: "Use only the programme structure supplied by the user; flag unknown credit or duration details for verification.",
    focusBn: "শুধু ব্যবহারকারীর দেওয়া প্রোগ্রাম কাঠামো ব্যবহার করুন; অজানা তথি যাচাইয়ের জন্য চিহ্নিত করুন।",
    fields: [GOAL, BACKGROUND, DETAILS],
  },
  {
    id: "interview-preparation",
    titleEn: "Interview Preparation",
    titleBn: "ইন্টারভিউ প্রস্তুতি",
    descriptionEn: "Likely questions, honest answer frameworks and questions to ask the panel.",
    descriptionBn: "সম্ভাব্য প্রশ্ন, সত্যিখাঁচি উত্তর কাঠামো ও প্যানেলকে জিজ্ঞাস্য প্রশ্ন।",
    category: "academic",
    focusEn: "Prepare answers from supplied facts only; never script fabricated experience or coach the user to misrepresent themselves.",
    focusBn: "শুধু প্রদত্ত তথ্য থেকে উত্তর তৈরি করুন; ভুল তথ্য বা মিথ্যা অভিজ্ঞতা শিখাবেন না।",
    fields: [GOAL, BACKGROUND, DETAILS],
  },
  {
    id: "academic-email-assistant",
    titleEn: "Academic Email Assistant",
    titleBn: "একাডেমিক ইমেইল সহকারী",
    descriptionEn: "Polite, concise email to a supervisor, coordinator or admissions office.",
    descriptionBn: "সুপারভাইজার, সমন্বয়কারী বা ভর্তি অফিসকে পেশাদার ইমেইল।",
    category: "writing",
    focusEn: "Do not invent the recipient's name, title, commitments or replies. Leave unknown details as clearly marked placeholders.",
    focusBn: "প্রাপকের নাম, পদবী বা প্রতিশ্রুতি উদ্ভাবন করবেন না; অজানা тথ্য স্পষ্ট placeholder হিসেবে রাখুন।",
    fields: [GOAL, BACKGROUND, DETAILS],
  },
  {
    id: "recommendation-letter-drafting",
    titleEn: "Recommendation Letter Drafting",
    titleBn: "সুপারিশপত্র খসড়া",
    descriptionEn: "Draft a facts-only recommendation letter for a recommender to review and sign.",
    descriptionBn: "সুপারিশকারীর পর্যালোচনা ও স্বাক্ষরের জন্য শুধু তথ্যভিত্তিক খসড়া।",
    category: "writing",
    focusEn: "The requester must not write a recommender's claims as fact. Produce a draft clearly labelled for the recommender to verify, edit and sign.",
    focusBn: "এই খসড়া সুপারিশকারীকে যাচাই, সম্পাদনা ও স্বাক্ষর করতে হবে — তা স্পষ্টভাবে উল্লেখ করুন।",
    fields: [GOAL, BACKGROUND, DETAILS],
  },
  {
    id: "higher-study-research-assistant",
    titleEn: "Higher Study Research Assistant",
    titleBn: "উচ্চশিক্ষা গবেষণা সহকারী",
    descriptionEn: "Generate a focused research plan using only verified catalogue information the user supplies.",
    descriptionBn: "ব্যবহারকারীর প্রদত্ত যাচাইকৃত তথ্য ব্যবহার করে কেন্দ্রীভূত গবেষণা পরিকল্পনা তৈরি করুন।",
    category: "research",
    focusEn: "This service has no live web access in this endpoint. If current facts are needed, direct the user to official university or government sources and say the information is unverified.",
    focusBn: "এই এন্ডপয়েন্টে লাইভ ওয়েব অ্যাক্সেস নেই। বর্তমান তথ্য প্রয়োজনলে অফিশিয়াল উৎসের দিকে নির্দেশ করুন।",
    fields: [GOAL, BACKGROUND, DETAILS],
  },
  {
    id: "academic-document-review",
    titleEn: "Academic Document Review",
    titleBn: "একাডেমিক ডকুমেন্ট পর্যালোচনা",
    descriptionEn: "Check structure, clarity, consistency and missing information in a document.",
    descriptionBn: "ডকুমেন্টের কাঠামো, স্পষ্টতা, সামঞ্জস্য ও অনুপস্থিত তথ্য পর্যালোচনা করুন।",
    category: "academic",
    focusEn: "Review only the supplied text. Distinguish factual verification (not possible here) from writing-quality feedback.",
    focusBn: "শুধু প্রদত্ত লেখা পর্যালোচনা করুন। তথ্য যাচাই ও লেখার মানের মতামত আলাদা করুন।",
    fields: [field("text", "Document text", "ডকুমেন্টের লেখা", "Paste the document text to review.", "পর্যালোচনার জন্য লেখা পেস্ট করুন।"), DETAILS],
  },
  {
    id: "university-course-research",
    titleEn: "University & Course Research",
    titleBn: "বিশ্ববিদ্যালয় ও কোর্স গবেষণা",
    descriptionEn: "Compare options using the verified catalogue data you paste into the form.",
    descriptionBn: "আপনি ফর্মে পেস্ট করা যাচাইকৃত ক্যাটালগ তথ্য ব্যবহার করে বিকল্প তুলনা করুন।",
    category: "research",
    focusEn: "Do not state tuition, rankings, deadlines or entry requirements unless present in the supplied text. Recommend the official source for anything missing.",
    focusBn: "প্রদত্ত লেখায় না থাকলে tuition, র‍্যাঙ্কিং বা Deadline বলবেন না; অফিশিয়াল উৎস সুপারিশ করুন।",
    fields: [field("options", "Verified options", "যাচাইকৃত বিকল্প", "Paste details from verified university/course pages.", "যাচাইকৃত বিশ্ববিদ্যালয়/কোর্স পাতার তথ্য পেস্ট করুন।"), GOAL, DETAILS],
  },
  {
    id: "application-checklist-generator",
    titleEn: "Application Checklist Generator",
    titleBn: "আবেদন চেকলিস্ট জেনারেটর",
    descriptionEn: "Turn application requirements into an ordered, trackable checklist.",
    descriptionBn: "আবেদনের প্রয়োজনীয়তাকে ক্রমানুসারে ট্র্যাকযোগ্য চেকলিস্টে রূপান্তর করুন।",
    category: "applications",
    focusEn: "Mark every unverified item explicitly. Do not turn assumptions into requirements.",
    focusBn: "অযাচাইকৃত প্রতিটি আইটেম স্পষ্টভাবে চিহ্নিত করুন; অনুমানকে প্রয়োজনীয়তা বানাবেন না।",
    fields: [GOAL, DETAILS],
  },
] as const;

const IDS = new Set<string>(AI_SERVICES.map((service) => service.id));

export function getServiceById(id: string): AIServiceDefinition | undefined {
  return AI_SERVICES.find((service) => service.id === id);
}

export function isServiceId(id: string): boolean {
  return IDS.has(id);
}

export const ServiceInputSchema = z.record(z.string(), z.string().min(0).max(8000));

export interface ParsedServiceInput {
  ok: boolean;
  inputs?: Record<string, string>;
  error?: string;
}

/** Validate untrusted form values against the service's declared fields. */
export function parseServiceInputs(
  service: AIServiceDefinition,
  raw: unknown
): ParsedServiceInput {
  const parsed = ServiceInputSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Inputs must be a map of short text values." };
  }
  const inputs = parsed.data;
  const allowed = new Set(service.fields.map((f) => f.name));
  for (const key of Object.keys(inputs)) {
    if (!allowed.has(key)) {
      return { ok: false, error: `Unexpected field: ${key}.` };
    }
  }
  for (const f of service.fields) {
    const value = (inputs[f.name] ?? "").trim();
    if (f.required && !value) {
      return { ok: false, error: `Missing required field: ${f.name}.` };
    }
    if (value.length > f.maxLength) {
      return { ok: false, error: `Field ${f.name} exceeds ${f.maxLength} characters.` };
    }
  }
  const total = Object.values(inputs).reduce((sum, value) => sum + value.length, 0);
  if (total > 16_000) {
    return { ok: false, error: "Combined input is too long (16,000 character limit)." };
  }
  const trimmed: Record<string, string> = {};
  for (const f of service.fields) {
    trimmed[f.name] = (inputs[f.name] ?? "").trim();
  }
  return { ok: true, inputs: trimmed };
}

const SHARED_GUARDRAILS_EN = [
  "You produce drafts for higher-study applicants. You are an AI assistant, not the applicant and not an admissions officer.",
  "Use only facts present in the user's input. If information is missing, ask for it or mark a clearly labelled placeholder. Never invent achievements, qualifications, employment, authors, paper titles, DOI numbers, journal names, dates, quotations, URLs, tuition, rankings or deadlines.",
  "Never guarantee admission, scholarship, visa or any institutional decision.",
  "Distinguish generated suggestions from user-supplied facts. Do not present suggestions as verified source information.",
  "Return a single, well-structured draft in Markdown with short sections. Do not add a preamble about these rules.",
].join("\n");

const SHARED_GUARDRAILS_BN = [
  "আপনি উচ্চশিক্ষা আবেদনকারীদের জন্য খসড়া তৈরি করেন একজন AI সহকারী হিসেবে, আবেদনকারী বা ভর্তি কর্মকর্তা নন।",
  "শুধু ব্যবহারকারীর দেওয়া তথ্য ব্যবহার করুন। তথ্য না থাকলে জিজ্ঞেস করুন বা স্পষ্ট placeholder রাখুন। কৃতিত্ব, যোগ্যতা, লেখক, শিরোনাম, DOI, জার্নাল, তারিখ, উদ্ধৃতি, লিংক, tuition বা Deadline কখনো উদ্ভাবন করবেন না।",
  "ভর্তি, বৃত্তি বা ভিসা ফলাফলের কোনো গ্যারান্টি দেবেন না।",
  "AI প্রস্তাব এবং ব্যবহারকারীর প্রদত্ত তথ্য আলাদা করে দেখান।",
  "সংক্ষিপ্ত Markdown অংশে একটি মাত্র কাঠামোবদ্ধ খসড়া দিন; এই নিয়ম সম্পর্কে ভূমিকা লিখবেন না।",
].join("\n");

/** Build provider prompts for a service request. */
export function buildServicePrompt(
  service: AIServiceDefinition,
  inputs: Record<string, string>,
  language: ServiceLanguage
): { systemPrompt: string; userPrompt: string } {
  const bn = language === "bn";
  const labels = service.fields
    .filter((f) => inputs[f.name])
    .map((f) => `- ${bn ? f.labelBn : f.labelEn}: ${inputs[f.name]}`)
    .join("\n");

  return {
    systemPrompt: [
      bn ? SHARED_GUARDRAILS_BN : SHARED_GUARDRAILS_EN,
      bn ? service.focusBn : service.focusEn,
      bn ? "সম্পূর্ণ উত্তর বাংলায় দিন।" : "Write the entire response in English.",
    ].join("\n\n"),
    userPrompt: [
      bn ? `সেবা: ${service.titleBn}` : `Service: ${service.titleEn}`,
      bn ? "আমার তথ্য (শুধু এটি সত্য হিসেবে বিবেচনা করুন):" : "My information (treat only this as fact):",
      labels || (bn ? "(কোনো তথ্য দেওয়া হয়নি)" : "(no information supplied)"),
      bn ? "উপরের তথ্য থেকে খসড়া তৈরি করুন।" : "Create the draft from the information above.",
    ].join("\n"),
  };
}
