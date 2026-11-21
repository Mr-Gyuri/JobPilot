// Deterministic keyword engine. Used by match analysis, resume tailoring and
// interview prep so all three agree on what a job posting is actually asking
// for — and so the whole app still works with no AI key configured.

export interface WeightedKeyword {
  canonical: string;
  display: string;
  weight: number;
  aliases: string[];
  /**
   * `dictionary` terms come from the curated skill list, so they are genuinely
   * things a candidate either has or lacks. `prose` terms are n-grams lifted
   * from the posting's wording ("deploy software solutions", "meet business")
   * — useful as hints, but scoring on them punishes a strong candidate for not
   * echoing a recruiter's phrasing.
   */
  kind: "dictionary" | "prose";
}

export const STOPWORDS = new Set<string>([
  // common English
  "a","about","above","after","again","against","all","also","am","an","and","any","are","as","at",
  "be","because","been","before","being","below","between","both","but","by","can","cannot","could",
  "did","do","does","doing","down","during","each","few","for","from","further","had","has","have",
  "having","he","her","here","hers","herself","him","himself","his","how","i","if","in","into","is",
  "it","its","itself","just","me","more","most","my","myself","no","nor","not","now","of","off","on",
  "once","only","or","other","ought","our","ours","ourselves","out","over","own","same","she","should",
  "so","some","such","than","that","the","their","theirs","them","themselves","then","there","these",
  "they","this","those","through","to","too","under","until","up","very","was","we","were","what",
  "when","where","which","while","who","whom","why","will","with","would","you","your","yours",
  "yourself","yourselves","across","along","among","around","upon","within","without","via","per",
  // job-description boilerplate — high frequency, zero signal
  "responsibilities","responsibility","candidate","candidates","ability","able","including","include",
  "includes","included","years","year","experience","experienced","work","working","works","team",
  "teams","role","roles","position","positions","required","require","requires","requirement",
  "requirements","preferred","preferably","qualification","qualifications","skill","skills","job",
  "jobs","company","companies","opportunity","opportunities","applicant","applicants","apply",
  "application","looking","seeking","join","joining","help","helping","ensure","ensuring","provide",
  "providing","support","supporting","strong","excellent","good","great","best","new","plus","must",
  "minimum","maximum","etc","well","other","others","related","relevant","various","daily","weekly",
  "monthly","time","full","part","salary","benefits","hiring","hire","urgent","immediate","asap",
  "please","send","resume","cv","email","contact","location","based","offer","offers","offering",
  "duties","tasks","task","description","overview","summary","about","who","what","essential",
  "desirable","nice","bonus","advantage","willing","available","start","immediately","onsite",
  "office","department","reporting","reports","report","manage","managing","using","use","used",
  "knowledge","understanding","familiar","familiarity","proficiency","proficient","demonstrated",
  "proven","track","record","successful","success","high","level","levels","one","two","three","four",
  "five","day","days","week","month","year","hour","hours","company's","we're","you'll","we'll",
]);

export const SOFT_SKILLS = new Set<string>([
  "leadership","communication","written communication","verbal communication","teamwork",
  "collaboration","cross-functional collaboration","stakeholder management","mentoring","coaching",
  "problem solving","critical thinking","analytical thinking","time management","organization",
  "attention to detail","adaptability","flexibility","initiative","self-starter","proactive",
  "negotiation","conflict resolution","decision making","prioritization","multitasking",
  "presentation","public speaking","client management",
  "relationship building","project management","people management","team management",
  "strategic thinking","creativity","innovation","resourcefulness","accountability","ownership",
  "work ethic","interpersonal skills","emotional intelligence","active listening","empathy",
  "documentation","training","facilitation","remote collaboration","independent work",
]);

// canonical -> aliases (all lowercase). Longest alias is matched first so
// "node.js" wins over "node" and "google cloud platform" over "google".
const TECH_DICTIONARY: [string, string[]][] = [
  // --- languages ---
  ["javascript", ["js", "ecmascript", "es6", "es2015"]],
  ["typescript", ["ts"]],
  ["python", ["python3", "py"]],
  ["java", []],
  ["c#", ["csharp", "c sharp", ".net", "dotnet", "dot net"]],
  ["c++", ["cpp", "c plus plus"]],
  ["c", []],
  ["php", []],
  ["ruby", []],
  ["go", ["golang"]],
  ["kotlin", []],
  ["swift", []],
  ["objective-c", ["objective c", "objc"]],
  ["rust", []],
  ["scala", []],
  ["perl", []],
  ["r", []],
  ["matlab", []],
  ["dart", []],
  ["elixir", []],
  ["haskell", []],
  ["lua", []],
  ["groovy", []],
  ["visual basic", ["vb", "vb.net", "vba"]],
  ["sql", ["structured query language"]],
  ["pl/sql", ["plsql"]],
  ["t-sql", ["tsql", "transact-sql"]],
  ["html", ["html5"]],
  ["css", ["css3"]],
  ["sass", ["scss"]],
  ["less", []],
  ["xml", []],
  ["json", []],
  ["yaml", ["yml"]],
  ["graphql", ["gql"]],
  ["bash", ["shell scripting", "shell script", "sh"]],
  ["powershell", ["power shell"]],
  ["assembly", []],
  ["solidity", []],
  ["abap", []],
  ["cobol", []],

  // --- frontend frameworks/libraries ---
  ["react", ["react.js", "reactjs"]],
  ["next.js", ["nextjs", "next js"]],
  ["angular", ["angularjs", "angular.js"]],
  ["vue", ["vue.js", "vuejs"]],
  ["nuxt", ["nuxt.js", "nuxtjs"]],
  ["svelte", ["sveltekit"]],
  ["jquery", []],
  ["redux", ["redux toolkit"]],
  ["tailwind css", ["tailwind", "tailwindcss"]],
  ["bootstrap", []],
  ["material ui", ["mui", "material-ui"]],
  ["webpack", []],
  ["vite", []],
  ["babel", []],
  ["storybook", []],
  ["three.js", ["threejs"]],
  ["d3.js", ["d3", "d3js"]],
  ["react native", ["react-native"]],
  ["flutter", []],
  ["ionic", []],
  ["xamarin", []],
  ["electron", []],
  ["jamstack", []],
  ["web components", []],
  ["responsive design", ["responsive web design", "mobile-first"]],
  ["accessibility", ["a11y", "wcag"]],
  ["progressive web app", ["pwa"]],

  // --- backend / API ---
  ["node.js", ["node", "nodejs", "node js"]],
  ["express", ["express.js", "expressjs"]],
  ["nestjs", ["nest.js"]],
  ["fastify", []],
  ["django", []],
  ["flask", []],
  ["fastapi", []],
  ["laravel", []],
  ["codeigniter", []],
  ["symfony", []],
  ["ruby on rails", ["rails", "ror"]],
  ["spring boot", ["spring", "springboot"]],
  ["asp.net", ["asp.net core", "aspnet"]],
  ["entity framework", ["ef core"]],
  ["hibernate", []],
  ["rest", ["restful", "rest api", "restful api", "rest apis"]],
  ["grpc", []],
  ["soap", []],
  ["websocket", ["websockets", "socket.io"]],
  ["microservices", ["microservice", "micro-services"]],
  ["serverless", ["lambda functions"]],
  ["api integration", ["third-party api", "api integrations"]],
  ["oauth", ["oauth2", "oauth 2.0"]],
  ["jwt", ["json web token"]],
  ["openapi", ["swagger"]],
  ["message queue", ["rabbitmq", "activemq", "sqs"]],
  ["celery", []],
  ["cron", ["cron jobs", "scheduled jobs"]],

  // --- data ---
  ["postgresql", ["postgres", "psql"]],
  ["mysql", ["mariadb"]],
  ["sql server", ["mssql", "microsoft sql server"]],
  ["sqlite", []],
  ["oracle", ["oracle db", "oracle database"]],
  ["mongodb", ["mongo", "mongoose"]],
  ["redis", []],
  ["elasticsearch", ["elastic search", "opensearch"]],
  ["cassandra", []],
  ["dynamodb", []],
  ["firebase", ["firestore"]],
  ["supabase", []],
  ["neo4j", []],
  ["kafka", ["apache kafka"]],
  ["spark", ["apache spark", "pyspark"]],
  ["hadoop", ["hdfs", "mapreduce"]],
  ["hive", []],
  ["snowflake", []],
  ["bigquery", ["big query"]],
  ["redshift", []],
  ["databricks", []],
  ["dbt", ["data build tool"]],
  ["airflow", ["apache airflow"]],
  ["etl", ["etl pipeline", "elt", "data pipeline", "data pipelines"]],
  ["data warehouse", ["data warehousing", "datawarehouse"]],
  ["data modeling", ["dimensional modeling", "data modelling"]],
  ["pandas", []],
  ["numpy", []],
  ["scikit-learn", ["sklearn", "scikit learn"]],
  ["tensorflow", []],
  ["pytorch", []],
  ["keras", []],
  ["machine learning", ["ml"]],
  ["deep learning", ["neural networks"]],
  ["nlp", ["natural language processing"]],
  ["computer vision", ["opencv"]],
  ["data analysis", ["data analytics", "data analyst"]],
  ["data visualization", ["data viz", "dataviz"]],
  ["statistics", ["statistical analysis"]],
  ["a/b testing", ["ab testing", "split testing"]],
  ["business intelligence", ["bi"]],

  // --- cloud / devops / infra ---
  ["aws", ["amazon web services", "ec2", "s3"]],
  ["azure", ["microsoft azure"]],
  ["gcp", ["google cloud", "google cloud platform"]],
  ["docker", ["containerization", "containers"]],
  ["kubernetes", ["k8s", "eks", "aks", "gke"]],
  ["terraform", ["infrastructure as code", "iac"]],
  ["ansible", []],
  ["puppet", []],
  ["chef", []],
  ["jenkins", []],
  ["github actions", ["gh actions"]],
  ["gitlab ci", ["gitlab ci/cd"]],
  ["circleci", ["circle ci"]],
  ["azure devops", ["vsts", "tfs"]],
  ["ci/cd", ["continuous integration", "continuous delivery", "continuous deployment", "cicd"]],
  ["linux", ["ubuntu", "centos", "debian", "rhel"]],
  ["windows server", []],
  ["nginx", []],
  ["apache", ["httpd", "apache2"]],
  ["load balancing", ["load balancer"]],
  ["monitoring", ["observability", "prometheus", "grafana", "datadog", "new relic"]],
  ["logging", ["elk", "elk stack", "splunk", "cloudwatch"]],
  ["helm", []],
  ["vagrant", []],
  ["cloudflare", ["cdn"]],
  ["vercel", []],
  ["netlify", []],
  ["heroku", []],
  ["digitalocean", ["digital ocean"]],
  ["vmware", ["virtualization", "hyper-v"]],
  ["networking", ["tcp/ip", "dns", "vpn", "firewall"]],
  ["site reliability", ["sre"]],
  ["devops", []],
  ["devsecops", []],
  ["cybersecurity", ["information security", "infosec", "security"]],
  ["penetration testing", ["pen testing", "pentest", "ethical hacking"]],
  ["iso 27001", ["iso27001"]],
  ["soc 2", ["soc2"]],
  ["gdpr", []],
  ["hipaa", []],
  ["pci dss", ["pci-dss", "pci compliance"]],

  // --- tools / practices ---
  ["git", ["github", "gitlab", "bitbucket", "version control"]],
  ["agile", ["agile methodology", "agile methodologies"]],
  ["scrum", ["scrum master", "sprint planning", "daily standup"]],
  ["kanban", []],
  ["jira", ["atlassian jira"]],
  ["confluence", []],
  ["trello", []],
  ["asana", []],
  ["monday.com", ["monday com"]],
  ["notion", []],
  ["slack", []],
  ["microsoft teams", ["ms teams"]],
  ["tdd", ["test-driven development", "test driven development"]],
  ["bdd", ["behavior-driven development", "cucumber", "gherkin"]],
  ["unit testing", ["unit test", "unit tests"]],
  ["integration testing", ["integration tests"]],
  ["end-to-end testing", ["e2e testing", "e2e tests"]],
  ["automated testing", ["test automation", "automation testing"]],
  ["manual testing", []],
  ["qa", ["quality assurance", "quality control"]],
  ["jest", []],
  ["vitest", []],
  ["mocha", ["chai"]],
  ["pytest", ["unittest"]],
  ["junit", ["testng"]],
  ["cypress", []],
  ["playwright", []],
  ["selenium", ["webdriver"]],
  ["appium", []],
  ["postman", ["insomnia"]],
  ["jmeter", ["load testing", "performance testing"]],
  ["code review", ["peer review", "pull request", "pull requests"]],
  ["pair programming", []],
  ["design patterns", ["solid principles", "solid"]],
  ["object-oriented programming", ["oop", "object oriented"]],
  ["functional programming", []],
  ["data structures", ["algorithms", "data structures and algorithms"]],
  ["system design", ["software architecture", "architecture design"]],
  ["technical documentation", ["documentation writing"]],
  ["debugging", ["troubleshooting", "root cause analysis"]],
  ["refactoring", ["code quality", "clean code"]],
  ["performance optimization", ["performance tuning", "optimization"]],
  ["scalability", ["high availability"]],
  ["sdlc", ["software development lifecycle"]],
  ["waterfall", []],

  // --- design / creative ---
  ["figma", []],
  ["sketch", []],
  ["adobe xd", ["xd"]],
  ["photoshop", ["adobe photoshop", "ps"]],
  ["illustrator", ["adobe illustrator", "ai"]],
  ["indesign", ["adobe indesign"]],
  ["after effects", ["adobe after effects"]],
  ["premiere pro", ["adobe premiere", "premiere"]],
  ["final cut pro", ["final cut"]],
  ["davinci resolve", []],
  ["canva", []],
  ["ui design", ["user interface design"]],
  ["ux design", ["user experience design", "ux"]],
  ["ui/ux", ["ui ux"]],
  ["wireframing", ["wireframes", "prototyping", "mockups"]],
  ["user research", ["usability testing"]],
  ["design system", ["design systems"]],
  ["branding", ["brand identity"]],
  ["graphic design", []],
  ["motion graphics", ["animation"]],
  ["video editing", ["video production"]],
  ["photography", ["photo editing"]],
  ["3d modeling", ["blender", "3ds max", "maya"]],
  ["autocad", ["auto cad"]],
  ["solidworks", []],
  ["revit", ["bim"]],

  // --- business / marketing / ops (strong in the PH market) ---
  ["seo", ["search engine optimization"]],
  ["sem", ["search engine marketing", "ppc", "pay per click"]],
  ["google ads", ["adwords", "google adwords"]],
  ["facebook ads", ["meta ads", "fb ads"]],
  ["google analytics", ["ga4", "google analytics 4"]],
  ["google tag manager", ["gtm"]],
  ["email marketing", ["mailchimp", "klaviyo", "email campaigns"]],
  ["content marketing", ["content strategy"]],
  ["social media management", ["social media marketing", "smm"]],
  ["copywriting", ["copy writing"]],
  ["content writing", ["article writing", "blog writing"]],
  ["technical writing", []],
  ["proofreading", ["editing"]],
  ["crm", ["customer relationship management"]],
  ["salesforce", ["sfdc"]],
  ["hubspot", []],
  ["zoho", []],
  ["marketo", []],
  ["wordpress", ["wp"]],
  ["shopify", []],
  ["woocommerce", []],
  ["magento", []],
  ["webflow", []],
  ["squarespace", []],
  ["wix", []],
  ["e-commerce", ["ecommerce", "online store"]],
  ["dropshipping", []],
  ["amazon fba", ["fba", "amazon seller central"]],
  ["lead generation", ["lead gen", "prospecting"]],
  ["cold calling", ["cold calls"]],
  ["telemarketing", ["outbound calls"]],
  ["appointment setting", ["appointment setter"]],
  ["sales", ["b2b sales", "b2c sales", "inside sales"]],
  ["account management", ["account manager", "key accounts"]],
  ["business development", ["bizdev", "bd"]],
  ["market research", ["competitive analysis"]],
  ["customer support", ["technical support", "help desk", "helpdesk", "tier 1 support"]],
  ["chat support", ["live chat", "email support"]],
  ["call center", ["bpo", "contact center", "csr"]],
  ["virtual assistant", ["va", "executive assistant", "admin assistant"]],
  ["data entry", ["data encoding"]],
  ["transcription", ["medical transcription", "audio transcription"]],
  ["bookkeeping", ["bookkeeper"]],
  ["accounting", ["general accounting", "financial accounting"]],
  ["accounts payable", ["ap"]],
  ["accounts receivable", ["ar"]],
  ["bank reconciliation", ["reconciliation"]],
  ["payroll", ["payroll processing"]],
  ["quickbooks", ["quickbooks online", "qbo"]],
  ["xero", []],
  ["sap", ["sap erp"]],
  ["oracle netsuite", ["netsuite"]],
  ["erp", ["enterprise resource planning"]],
  ["financial reporting", ["financial statements"]],
  ["financial analysis", ["fp&a", "financial modeling"]],
  ["budgeting", ["forecasting", "budget management"]],
  ["taxation", ["tax preparation", "bir", "tax compliance"]],
  ["audit", ["auditing", "internal audit"]],
  ["invoicing", ["billing", "medical billing"]],
  ["excel", ["microsoft excel", "ms excel", "pivot tables", "vlookup", "advanced excel"]],
  ["google sheets", ["spreadsheets"]],
  ["powerpoint", ["microsoft powerpoint", "ms powerpoint"]],
  ["microsoft word", ["ms word"]],
  ["microsoft office", ["ms office", "office 365", "microsoft 365"]],
  ["power bi", ["powerbi", "microsoft power bi"]],
  ["tableau", []],
  ["looker", ["looker studio", "data studio"]],
  ["qlik", ["qlikview", "qlik sense"]],
  ["power automate", ["microsoft flow"]],
  ["zapier", ["make.com", "integromat"]],
  ["rpa", ["robotic process automation", "uipath", "automation anywhere"]],
  ["recruitment", ["recruiting", "talent acquisition", "sourcing", "end-to-end recruitment"]],
  ["onboarding", ["employee onboarding"]],
  ["hr", ["human resources", "hris"]],
  ["employee relations", ["labor relations"]],
  // "compensation" alone is dropped: in engineering postings it almost always
  // means a compensating transaction, not pay and benefits.
  ["compensation and benefits", ["comp and ben", "compensation package"]],
  ["training and development", ["learning and development", "l&d"]],
  ["performance management", ["performance appraisal"]],
  ["logistics", ["supply chain", "supply chain management"]],
  ["inventory management", ["inventory control", "stock management"]],
  ["procurement", ["purchasing", "sourcing"]],
  ["warehouse", ["warehousing"]],
  ["customs", ["import export", "freight forwarding"]],
  ["lean", ["lean manufacturing", "six sigma", "kaizen", "5s"]],
  ["iso 9001", ["iso9001"]],
  ["operations management", ["ops management"]],
  ["process improvement", ["business process improvement", "process optimization"]],
  ["business analysis", ["business analyst", "requirements gathering"]],
  ["product management", ["product owner", "product manager", "roadmap"]],
  ["stakeholder communication", ["client communication"]],
  ["vendor management", ["supplier management"]],
  ["risk management", ["risk assessment"]],
  ["compliance", ["regulatory compliance"]],
  ["contract management", ["contracts"]],
  ["legal research", ["paralegal"]],

  // --- healthcare / education / other verticals ---
  ["nursing", ["registered nurse", "rn"]],
  ["patient care", ["patient support"]],
  ["medical coding", ["icd-10", "cpt"]],
  ["pharmacy", ["pharmacist"]],
  ["clinical research", ["clinical trials"]],
  ["teaching", ["tutoring", "esl", "online teaching"]],
  ["curriculum development", ["instructional design"]],
  ["technical training", ["corporate training"]],
  ["real estate", ["property management"]],
  ["insurance", ["underwriting", "claims processing"]],
  ["banking", ["retail banking", "loans", "credit analysis"]],
  ["kyc", ["know your customer", "aml", "anti-money laundering"]],
  ["architecture", ["architectural design"]],
  ["civil engineering", ["structural engineering"]],
  ["electrical engineering", []],
  ["mechanical engineering", []],
  ["hvac", []],
  ["maintenance", ["preventive maintenance"]],
  ["construction management", ["project estimation"]],
  ["food safety", ["haccp"]],
  ["hospitality", ["hotel operations", "front desk"]],
  ["culinary", ["food preparation"]],
  ["event management", ["event planning"]],
  ["travel booking", ["itinerary planning"]],
];

interface AliasEntry {
  alias: string;
  canonical: string;
  kind: "tech" | "soft";
}

// Every alias (plus canonical forms) sorted longest-first so multi-word and
// punctuation-heavy terms are consumed before their shorter substrings.
const ALIAS_INDEX: AliasEntry[] = (() => {
  const entries: AliasEntry[] = [];
  for (const [canonical, aliases] of TECH_DICTIONARY) {
    entries.push({ alias: canonical, canonical, kind: "tech" });
    for (const alias of aliases) entries.push({ alias, canonical, kind: "tech" });
  }
  for (const soft of SOFT_SKILLS) {
    entries.push({ alias: soft, canonical: soft, kind: "soft" });
  }
  return entries.sort((a, b) => b.alias.length - a.alias.length);
})();

const CANONICAL_ALIASES = new Map<string, string[]>(
  TECH_DICTIONARY.map(([canonical, aliases]) => [canonical, [canonical, ...aliases]])
);

const DISPLAY_OVERRIDES = new Map<string, string>([
  ["javascript", "JavaScript"], ["typescript", "TypeScript"], ["c#", "C#"], ["c++", "C++"],
  ["node.js", "Node.js"], ["next.js", "Next.js"], ["react", "React"], ["vue", "Vue"],
  ["aws", "AWS"], ["gcp", "GCP"], ["sql", "SQL"], ["html", "HTML"], ["css", "CSS"],
  ["rest", "REST"], ["graphql", "GraphQL"], ["ci/cd", "CI/CD"], ["qa", "QA"], ["hr", "HR"],
  ["seo", "SEO"], ["sem", "SEM"], ["crm", "CRM"], ["erp", "ERP"], ["sap", "SAP"],
  ["ui/ux", "UI/UX"], ["tdd", "TDD"], ["etl", "ETL"], ["nlp", "NLP"], ["rpa", "RPA"],
  ["kyc", "KYC"], ["php", "PHP"], ["sdlc", "SDLC"], ["oop", "OOP"], ["jwt", "JWT"],
  ["postgresql", "PostgreSQL"], ["mysql", "MySQL"], ["mongodb", "MongoDB"],
  ["kubernetes", "Kubernetes"], ["docker", "Docker"], ["power bi", "Power BI"],
]);

function titleCase(value: string): string {
  return value
    .split(" ")
    .map((w) => (w.length <= 2 ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

function displayFor(canonical: string): string {
  return DISPLAY_OVERRIDES.get(canonical) ?? titleCase(canonical);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const WORD_CHAR = /[a-z0-9]/;

/**
 * Word-boundary-aware containment. Aliases with non-word characters ("c#",
 * ".net", "ci/cd") can't use \b, so boundaries are checked by hand.
 */
function aliasInText(alias: string, haystackLower: string): boolean {
  if (/^[a-z0-9 ]+$/.test(alias)) {
    return new RegExp(`\\b${escapeRegex(alias)}\\b`).test(haystackLower);
  }
  let from = 0;
  for (;;) {
    const at = haystackLower.indexOf(alias, from);
    if (at === -1) return false;
    const before = at > 0 ? haystackLower[at - 1] : "";
    const after = haystackLower[at + alias.length] ?? "";
    const startOk = before === "" || !WORD_CHAR.test(before);
    const endOk = after === "" || !WORD_CHAR.test(after);
    if (startOk && endOk) return true;
    from = at + 1;
  }
}

export function keywordInText(kw: WeightedKeyword, haystackLower: string): boolean {
  return kw.aliases.some((alias) => aliasInText(alias, haystackLower));
}

/** Canonical forms of every dictionary term present in the text — used to alias-expand a resume. */
export function expandAliases(text: string): string[] {
  const lower = text.toLowerCase();
  const found: string[] = [];
  for (const entry of ALIAS_INDEX) {
    if (aliasInText(entry.alias, lower)) found.push(entry.canonical);
  }
  return [...new Set(found)];
}

const MAX_KEYWORDS = 60;

/**
 * Structural language every posting carries — the reporting line, the work
 * arrangement, the apply flow. None of it is a requirement, but the n-gram pass
 * cannot tell prose apart from skills, so leaving these in produced "missing"
 * keywords like "Development Supervisor" and "Business Needs" and padded the
 * denominator enough to halve an otherwise fair score.
 */
const BOILERPLATE = [
  "reports to",
  "development supervisor",
  "development manager",
  "hiring manager",
  "direct report",
  "work arrangement",
  "business needs",
  "work setup",
  "full time",
  "part time",
  "salary undisclosed",
  "expected salary",
  "basic salary",
  "employer questions",
  "company profile",
  "job description",
  "job advert",
  "quick apply",
  "view all jobs",
  "show more",
  "career advice",
  "about the role",
  "what you'll do",
  "what we're looking for",
  "why join us",
  "equal opportunity",
  "years experience",
  "years of experience",
  "related field",
  "or a related",
  "strong candidates",
  "will also be considered",
  "bachelor's degree",
  "professional growth",
  "continuous learning",
  "cross functional teams",
  "knowledge sharing",
];

/**
 * Terms that describe the job rather than the candidate. A place is never a
 * requirement a resume can satisfy, and being told to add "Mandaluyong City" or
 * "Hybrid" to your skills is noise that also dilutes the score.
 */
const NON_SKILL_TERMS = [
  // Work arrangement.
  "full onsite",
  "onsite",
  "on site",
  "hybrid",
  "work from home",
  "wfh",
  "work setup",
  // Places.
  "philippines",
  "metro manila",
  "manila",
  "mandaluyong",
  "makati",
  "taguig",
  "quezon city",
  "pasig",
  "ortigas",
  "alabang",
  "muntinlupa",
  "paranaque",
  "pasay",
  "caloocan",
  "marikina",
  "antipolo",
  "cebu",
  "davao",
  "iloilo",
  "bacolod",
  "baguio",
  "pampanga",
  "cavite",
  "laguna",
  "city",
  "singapore",
  "hong kong",
  "malaysia",
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Extract weighted keywords from a job description. Dictionary terms are
 * matched literally first (so "c#" and "node.js" survive tokenization), then
 * the remaining prose contributes n-grams.
 *
 * `exclude` blanks out phrases that are certainly not requirements — the
 * employer's own name and the job's location, which otherwise arrive as
 * "missing skills" the candidate is told to add to their resume.
 */
export function extractKeywords(text: string, exclude: string[] = []): WeightedKeyword[] {
  if (!text.trim()) return [];
  const lower = text.toLowerCase();
  const firstLine = lower.split("\n", 1)[0] ?? "";

  const byCanonical = new Map<string, WeightedKeyword>();
  const add = (
    canonical: string,
    weight: number,
    aliases: string[],
    kind: WeightedKeyword["kind"]
  ) => {
    const existing = byCanonical.get(canonical);
    if (existing) {
      existing.weight = Math.max(existing.weight, weight);
      // A term found in the dictionary stays a dictionary term.
      if (kind === "dictionary") existing.kind = "dictionary";
      return;
    }
    byCanonical.set(canonical, {
      canonical,
      display: displayFor(canonical),
      weight,
      aliases: [...new Set(aliases)],
      kind,
    });
  };

  // Pass 1 — literal dictionary matches, longest alias first. Matched spans are
  // blanked out so the n-gram pass can't re-derive them as noise. Run against
  // the full text, before any exclusion: a real requirement must still be found
  // when it happens to overlap the employer's name.
  let residue = lower;
  for (const entry of ALIAS_INDEX) {
    if (!aliasInText(entry.alias, residue)) continue;
    const weight = entry.kind === "tech" ? 3 : 2;
    add(entry.canonical, weight, CANONICAL_ALIASES.get(entry.canonical) ?? [entry.canonical], "dictionary");
    residue = residue.split(entry.alias).join(" ");
  }

  // Pass 1b — drop what is certainly not a requirement, so only the untrusted
  // n-gram pass is affected. Longest first, so "geco asia pte" clears before
  // the bare "asia" it contains.
  const noise = [
    ...exclude
      .filter((p) => p && p.trim().length >= 3)
      .map((p) => p.toLowerCase().trim())
      // Company suffixes are also stripped, so "GECO Asia Pte. Ltd" clears the
      // "geco asia" the tokenizer would otherwise leave behind.
      .flatMap((p) => [
        p,
        p.replace(/\b(?:pte|ltd|inc|corp|corporation|co|llc|gmbh|plc)\b\.?/g, "").trim(),
      ]),
    ...BOILERPLATE,
    ...NON_SKILL_TERMS,
  ]
    .filter((p) => p.length >= 3)
    .sort((a, b) => b.length - a.length);
  // Whole words only — a plain substring cut would turn "capacity" into "capa"
  // while removing "city".
  for (const phrase of noise) {
    residue = residue.replace(
      new RegExp(`(?<![a-z0-9])${escapeRegExp(phrase)}(?![a-z0-9])`, "g"),
      " "
    );
  }

  // Pass 2 — n-grams over what's left.
  const tokens = residue
    .split(/[^a-z0-9+#.]+/)
    .map((t) => t.replace(/^[.]+|[.]+$/g, ""))
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t) && !/^\d+$/.test(t));

  const counts = new Map<string, number>();
  const bump = (phrase: string) => counts.set(phrase, (counts.get(phrase) ?? 0) + 1);
  for (let i = 0; i < tokens.length; i++) {
    bump(tokens[i]);
    if (i + 1 < tokens.length) bump(`${tokens[i]} ${tokens[i + 1]}`);
    if (i + 2 < tokens.length) bump(`${tokens[i]} ${tokens[i + 1]} ${tokens[i + 2]}`);
  }

  for (const [phrase, count] of counts) {
    if (byCanonical.has(phrase)) continue;
    const words = phrase.split(" ");
    const inTitle = aliasInText(phrase, firstLine);
    if (words.length > 1) {
      // Multi-word phrases only earn a slot when repeated or title-bound.
      if (count >= 2 || inTitle) add(phrase, 2, [phrase], "prose");
      continue;
    }
    if (phrase.length < 4) continue;
    add(phrase, count >= 2 || inTitle ? 2 : 1, [phrase], "prose");
  }

  // Weight first, then original appearance order for stable, readable output.
  const firstIndex = (kw: WeightedKeyword) => {
    const at = lower.indexOf(kw.canonical);
    return at === -1 ? Number.MAX_SAFE_INTEGER : at;
  };
  return [...byCanonical.values()]
    .sort((a, b) => b.weight - a.weight || firstIndex(a) - firstIndex(b))
    .slice(0, MAX_KEYWORDS);
}
